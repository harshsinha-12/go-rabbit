import { withToolLogging } from "@/utils";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import { z } from "zod";

export const TOOL_RUN_VALIDATION = "runValidation";
const VALIDATION_COMMAND_TIMEOUT_MS = 60000;

export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  commands: z.array(
    z.object({
      command: z.string(),
      passed: z.boolean(),
      output: z.string(),
      skipped: z.boolean().optional(),
      timedOut: z.boolean().optional(),
      elapsedMs: z.number().optional(),
    }),
  ),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// This tool is used in the validation step of the agent workflow to run a series of human-approved validation commands in the cloned repository. It captures the output and pass/fail status of each command, returning a structured result that indicates whether all validations passed and includes the logs for each command. This allows the agent to determine if the generated patch is valid and ready for PR creation, or if it needs to iterate further based on failed validations.
export const DEF_RUN_VALIDATION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_RUN_VALIDATION,
    description:
      "Runs approved validation commands in the cloned repository and captures logs.",
    parameters: {
      type: "object",
      properties: {
        repositoryPath: { type: "string" },
        commands: { type: "array", items: { type: "string" } },
      },
      required: ["repositoryPath", "commands"],
      additionalProperties: false,
    },
  },
};

export type RunValidationInput = {
  repositoryPath: string;
  commands: string[];
  onCommandEvent?: (event: ValidationCommandEvent) => void;
};

export type ValidationCommandEvent = {
  command: string;
  status: "started" | "output" | "completed" | "failed" | "skipped";
  message: string;
  output?: string;
  elapsedMs?: number;
};

function parseCommand(command: string) {
  const parts = command.trim().split(/\s+/);
  const executable = parts[0];

  if (!executable) {
    throw new Error("Validation command cannot be empty");
  }

  return { executable, args: parts.slice(1) };
}

function compactOutput(output: string, maxLength = 1600) {
  const trimmedOutput = output.trim();

  if (trimmedOutput.length <= maxLength) {
    return trimmedOutput;
  }

  return trimmedOutput.slice(-maxLength);
}

function runValidationCommand({
  repositoryPath,
  command,
  onCommandEvent,
}: {
  repositoryPath: string;
  command: string;
  onCommandEvent?: RunValidationInput["onCommandEvent"];
}) {
  const { executable, args } = parseCommand(command);

  return new Promise<{
    command: string;
    passed: boolean;
    output: string;
    skipped?: boolean;
    timedOut?: boolean;
    elapsedMs?: number;
  }>(
    (resolve) => {
      let output = "";
      let recentOutput = "";
      let lastEmitAt = Date.now();
      const startedAt = Date.now();
      let settled = false;

      const emit = (event: ValidationCommandEvent) => {
        onCommandEvent?.(event);
      };
      const emitOutput = (force = false) => {
        const now = Date.now();

        if (!recentOutput.trim()) {
          return;
        }

        if (!force && now - lastEmitAt < 4000) {
          return;
        }

        emit({
          command,
          status: "output",
          message: `Validation output from \`${command}\`.`,
          output: compactOutput(recentOutput),
        });
        recentOutput = "";
        lastEmitAt = now;
      };

      emit({
        command,
        status: "started",
        message: `Started validation command: ${command}`,
      });

      const childProcess = spawn(executable, args, {
        cwd: repositoryPath,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const heartbeat = setInterval(() => {
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
        emitOutput(true);
        emit({
          command,
          status: "output",
          message: `Still running \`${command}\` after ${elapsedSeconds}s. Timeout at 120s.`,
          elapsedMs: Date.now() - startedAt,
        });
      }, 15000);

      const commandTimeout = setTimeout(() => {
        const elapsedMs = Date.now() - startedAt;
        output += `\nValidation skipped after ${Math.round(elapsedMs / 1000)}s timeout.`;
        childProcess.kill("SIGTERM");
        setTimeout(() => {
          if (!settled) {
            childProcess.kill("SIGKILL");
          }
        }, 3000);
        finish(false, {
          finalOutput: output,
          skipped: true,
          timedOut: true,
          status: "skipped",
          message: `Skipped validation command after 120s: ${command}`,
        });
      }, VALIDATION_COMMAND_TIMEOUT_MS);

      const finish = (
        passed: boolean,
        options: {
          finalOutput?: string;
          skipped?: boolean;
          timedOut?: boolean;
          status?: ValidationCommandEvent["status"];
          message?: string;
        } = {},
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        clearInterval(heartbeat);
        clearTimeout(commandTimeout);
        emitOutput(true);

        const elapsedMs = Date.now() - startedAt;
        const elapsedSeconds = Math.round(elapsedMs / 1000);
        emit({
          command,
          status: options.status ?? (passed ? "completed" : "failed"),
          message:
            options.message ??
            `${passed ? "Passed" : "Failed"} validation command: ${command}`,
          output: options.finalOutput
            ? compactOutput(options.finalOutput)
            : `Elapsed: ${elapsedSeconds}s`,
          elapsedMs,
        });
        resolve({
          command,
          passed,
          output,
          skipped: options.skipped,
          timedOut: options.timedOut,
          elapsedMs,
        });
      };

      childProcess.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        output += text;
        recentOutput += text;
        emitOutput();
      });

      childProcess.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        output += text;
        recentOutput += text;
        emitOutput();
      });

      childProcess.on("error", (error) => {
        output += error.message;
        finish(false, { finalOutput: error.message });
      });

      childProcess.on("close", (code) => {
        finish(code === 0, { finalOutput: code === 0 ? undefined : output });
      });
    },
  );
}

export async function runValidation({
  repositoryPath,
  commands,
  onCommandEvent,
}: RunValidationInput): Promise<ValidationResult> {
  return withToolLogging(
    TOOL_RUN_VALIDATION,
    { repositoryPath, commands },
    async () => {
      const results = [];

      for (const command of commands) {
        const result = await runValidationCommand({
          repositoryPath,
          command,
          onCommandEvent,
        });

        results.push(result);

        if (!result.passed) {
          break;
        }
      }

      return ValidationResultSchema.parse({
        passed: results.every((result) => result.passed),
        commands: results,
      });
    },
  );
}

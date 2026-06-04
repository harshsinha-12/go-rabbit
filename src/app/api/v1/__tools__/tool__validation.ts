import { withToolLogging } from "@/utils";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import OpenAI from "openai";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const TOOL_RUN_VALIDATION = "runValidation";

export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  commands: z.array(
    z.object({
      command: z.string(),
      passed: z.boolean(),
      output: z.string(),
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
};

function parseCommand(command: string) {
  const parts = command.trim().split(/\s+/);
  const executable = parts[0];

  if (!executable) {
    throw new Error("Validation command cannot be empty");
  }

  return { executable, args: parts.slice(1) };
}

export async function runValidation({
  repositoryPath,
  commands,
}: RunValidationInput): Promise<ValidationResult> {
  return withToolLogging(
    TOOL_RUN_VALIDATION,
    { repositoryPath, commands },
    async () => {
      const results = [];

      for (const command of commands) {
        const { executable, args } = parseCommand(command);

        try {
          const { stdout, stderr } = await execFileAsync(executable, args, {
            cwd: repositoryPath,
            maxBuffer: 1024 * 1024 * 10,
          });
          results.push({
            command,
            passed: true,
            output: `${stdout}${stderr}`,
          });
        } catch (error) {
          const output =
            error && typeof error === "object" && "stdout" in error
              ? `${String(error.stdout ?? "")}${String("stderr" in error ? error.stderr : "")}`
              : error instanceof Error
                ? error.message
                : "Validation command failed";

          results.push({
            command,
            passed: false,
            output,
          });
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

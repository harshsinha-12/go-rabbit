import { GPT_5_5 } from "@/config";
import { getAIClient } from "@/fetchers";
import { logger, withToolLogging } from "@/utils";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import { z } from "zod";
import { getPatchSystemPrompt, getPatchUserPrompt } from "../__prompts__";
import { getRepositoryDiff, readRepositoryFile } from "./tool__workspace";

const execFileAsync = promisify(execFile);

export const TOOL_GENERATE_FOCUSED_PATCH = "generateFocusedPatch";
export const TOOL_APPLY_APPROVED_PATCH = "applyApprovedPatch";

export const PatchDraftSchema = z.object({
  patch: z.string(),
  changedFiles: z.array(z.string()),
  rationale: z.string(),
  risks: z.array(z.string()),
});

export type PatchDraft = z.infer<typeof PatchDraftSchema>;

// This tool is used in the final step of the agent workflow to generate a focused git patch that addresses the selected GitHub issue. The generated patch is based on the issue details and the context from relevant files in the repository. After the patch is generated, it is presented to the user for approval before being applied to the codebase.
export const DEF_GENERATE_FOCUSED_PATCH: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_GENERATE_FOCUSED_PATCH,
      description:
        "Generates a focused, git-apply-valid patch after the human has approved the fix plan. The patch must be grounded only in repository files that were read and must not contain fake index hashes, Markdown fences, no-op hunks, or dependency checksum guesses.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: { type: "string" },
          issueTitle: { type: "string" },
          issueBody: { type: "string" },
          filesToInspect: { type: "array", items: { type: "string" } },
          repositoryTree: { type: "string" },
          retryFailureLog: { type: "string" },
          maxAttempts: { type: "number" },
        },
        required: ["repositoryPath", "issueTitle", "issueBody", "filesToInspect"],
        additionalProperties: false,
      },
    },
  };

// This tool is used in the final step of the agent workflow to apply a human-approved git patch to the repository. It first checks that the patch can be applied cleanly using git apply --check, then applies the patch. After applying, it returns the list of changed files, the raw diff, and the rationale for the changes, which can be displayed in the UI.
export const DEF_APPLY_APPROVED_PATCH: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_APPLY_APPROVED_PATCH,
      description:
        "Applies a human-approved git patch using git apply --check before applying it.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: { type: "string" },
          patch: { type: "string" },
          approvedPatch: { type: "boolean" },
          rationale: { type: "string" },
        },
        required: ["repositoryPath", "patch", "approvedPatch", "rationale"],
        additionalProperties: false,
      },
    },
  };

export type GenerateFocusedPatchInput = {
  repositoryPath: string;
  issueTitle: string;
  issueBody: string;
  filesToInspect: string[];
  repositoryTree?: string;
  retryFailureLog?: string;
  maxAttempts?: number;
  onAttempt?: (attempt: {
    attempt: number;
    passed: boolean;
    error: string;
    changedFiles: string[];
  }) => void;
};

export type ApplyApprovedPatchInput = {
  repositoryPath: string;
  patch: string;
  approvedPatch: boolean;
  rationale: string;
};

async function readPatchContext(repositoryPath: string, filesToInspect: string[]) {
  const files = await Promise.all(
    filesToInspect.slice(0, 18).map(async (filePath) => {
      const result = await readRepositoryFile({
        repositoryPath,
        filePath,
        maxBytes: 50000,
      }).catch(() => null);

      return result
        ? [
            `--- ${filePath}`,
            result.truncated ? "[file truncated after 50000 bytes]" : "[full file]",
            result.content,
          ].join("\n")
        : `--- ${filePath}\n[failed to read]`;
    }),
  );

  return files.join("\n\n");
}

function extractJsonObject(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM patch response did not contain a JSON object");
  }

  return content.slice(start, end + 1);
}

function stringifyModelField(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? item : JSON.stringify(item, null, 2),
      )
      .join("\n");
  }

  if (value == null) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => stringifyModelField(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
}

function sanitizePatch(patch: string) {
  return patch
    .replace(/^```(?:diff|patch)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .split("\n")
    .filter(
      (line) =>
        line.trim() !== "*** Begin Patch" &&
        line.trim() !== "*** End Patch" &&
        line.trim() !== "@@",
    )
    .join("\n")
    .trimEnd()
    .concat("\n");
}

function isLikelyUnifiedDiff(patch: string) {
  const trimmedPatch = sanitizePatch(patch).trim();

  if (!trimmedPatch) {
    return false;
  }

  return (
    trimmedPatch.includes("diff --git ") ||
    (trimmedPatch.includes("--- ") && trimmedPatch.includes("+++ "))
  );
}

function normalizePatchDraft(parsed: unknown) {
  const draft =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};

  const patch = sanitizePatch(stringifyModelField(draft.patch));

  if (!isLikelyUnifiedDiff(patch)) {
    throw new Error(
      "LLM patch response did not contain a valid unified diff. Return only a real git patch in the patch field.",
    );
  }

  return PatchDraftSchema.parse({
    patch,
    changedFiles: normalizeStringArray(draft.changedFiles),
    rationale: stringifyModelField(draft.rationale),
    risks: normalizeStringArray(draft.risks),
  });
}

function getCommandOutput(error: unknown) {
  if (error && typeof error === "object") {
    const maybeError = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
    const stdout = typeof maybeError.stdout === "string" ? maybeError.stdout : "";
    const stderr = typeof maybeError.stderr === "string" ? maybeError.stderr : "";
    const message = typeof maybeError.message === "string" ? maybeError.message : "";

    return `${stdout}${stderr}${message ? `\n${message}` : ""}`.trim();
  }

  return error instanceof Error ? error.message : "Command failed";
}

async function checkPatchApplies(repositoryPath: string, patch: string) {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "go-rabbit-"));
  const patchPath = path.join(tempDirectory, "candidate.patch");

  try {
    await writeFile(patchPath, sanitizePatch(patch), "utf8");
    await execFileAsync(
      "git",
      ["-C", repositoryPath, "apply", "--recount", "--check", patchPath],
      {
        maxBuffer: 1024 * 1024 * 10,
      },
    );

    return { ok: true as const, error: "" };
  } catch (error) {
    return {
      ok: false as const,
      error: getCommandOutput(error),
    };
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

export async function generateFocusedPatch(input: GenerateFocusedPatchInput) {
  return withToolLogging(
    TOOL_GENERATE_FOCUSED_PATCH,
    {
      repositoryPath: input.repositoryPath,
      issueTitle: input.issueTitle,
      retry: Boolean(input.retryFailureLog),
    },
    async () => {
      const context = await readPatchContext(
        input.repositoryPath,
        input.filesToInspect,
      );
      const client = getAIClient(GPT_5_5);
      let patchFailure = input.retryFailureLog ?? "";
      const maxAttempts = Math.min(Math.max(input.maxAttempts ?? 5, 1), 5);

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const response = await client.chat.completions.create({
          model: GPT_5_5,
          messages: [
            {
              role: "system",
              content: getPatchSystemPrompt(),
            },
            {
              role: "user",
              content: getPatchUserPrompt({
                issueTitle: input.issueTitle,
                issueBody: input.issueBody,
                patchFailure,
                repositoryTree: input.repositoryTree,
                context,
              }),
            },
          ],
        });
        const content = response.choices[0]?.message.content ?? "";
        const parsed = JSON.parse(extractJsonObject(content)) as unknown;
        const draft = normalizePatchDraft(parsed);
        const patchCheck = await checkPatchApplies(input.repositoryPath, draft.patch);

        input.onAttempt?.({
          attempt,
          passed: patchCheck.ok,
          error: patchCheck.error,
          changedFiles: draft.changedFiles,
        });
        logger.debug(
          {
            attempt,
            maxAttempts,
            contentLength: content.length,
            patchApplies: patchCheck.ok,
            patchError: patchCheck.error,
          },
          "Generated patch draft",
        );

        if (patchCheck.ok) {
          return draft;
        }

        patchFailure = patchCheck.error;
      }

      throw new Error(
        `Generated patch did not apply cleanly after ${maxAttempts} attempt(s). Last git apply error:\n${patchFailure}`,
      );
    },
  );
}

export async function applyApprovedPatch({
  repositoryPath,
  patch,
  approvedPatch,
  rationale,
}: ApplyApprovedPatchInput) {
  return withToolLogging(
    TOOL_APPLY_APPROVED_PATCH,
    { repositoryPath, approvedPatch },
    async () => {
      if (!approvedPatch) {
        throw new Error("Patch cannot be applied before human approval");
      }

      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "go-rabbit-"));
      const patchPath = path.join(tempDirectory, "approved.patch");
      const sanitizedPatch = sanitizePatch(patch);

      try {
        await writeFile(patchPath, sanitizedPatch, "utf8");
        const patchCheck = await checkPatchApplies(repositoryPath, sanitizedPatch);

        if (!patchCheck.ok) {
          throw new Error(`Approved patch does not apply cleanly:\n${patchCheck.error}`);
        }

        await execFileAsync(
          "git",
          ["-C", repositoryPath, "apply", "--recount", patchPath],
          {
            maxBuffer: 1024 * 1024 * 10,
          },
        );

        const { stdout: changedFilesOutput } = await execFileAsync(
          "git",
          ["-C", repositoryPath, "diff", "--name-only"],
          { maxBuffer: 1024 * 1024 * 5 },
        );
        const diff = await getRepositoryDiff({ repositoryPath });

        return {
          changedFiles: changedFilesOutput.split("\n").filter(Boolean),
          rawDiff: diff.diff,
          rationale,
        };
      } finally {
        await rm(tempDirectory, { force: true, recursive: true });
      }
    },
  );
}

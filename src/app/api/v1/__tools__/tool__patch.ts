import { DEFAULT_LLM_API_VERSION, GPT_5_2 } from "@/config";
import { getAIClient } from "@/fetchers";
import { logger, withToolLogging } from "@/utils";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import { z } from "zod";
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
        "Generates a focused git patch after the human has approved the fix plan.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: { type: "string" },
          issueTitle: { type: "string" },
          issueBody: { type: "string" },
          filesToInspect: { type: "array", items: { type: "string" } },
          retryFailureLog: { type: "string" },
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
  retryFailureLog?: string;
};

export type ApplyApprovedPatchInput = {
  repositoryPath: string;
  patch: string;
  approvedPatch: boolean;
  rationale: string;
};

async function readPatchContext(repositoryPath: string, filesToInspect: string[]) {
  const files = await Promise.all(
    filesToInspect.slice(0, 8).map(async (filePath) => {
      const result = await readRepositoryFile({
        repositoryPath,
        filePath,
        maxBytes: 12000,
      }).catch(() => null);

      return result
        ? `--- ${filePath}\n${result.content}`
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

function normalizePatchDraft(parsed: unknown) {
  const draft =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};

  return PatchDraftSchema.parse({
    patch: stringifyModelField(draft.patch),
    changedFiles: normalizeStringArray(draft.changedFiles),
    rationale: stringifyModelField(draft.rationale),
    risks: normalizeStringArray(draft.risks),
  });
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
      const client = getAIClient(GPT_5_2, DEFAULT_LLM_API_VERSION);
      const response = await client.chat.completions.create({
        model: GPT_5_2,
        messages: [
          {
            role: "system",
            content:
              "You generate minimal git patches for Go repositories. Return only JSON with keys patch, changedFiles, rationale, risks. patch must be a unified git diff that git apply can apply.",
          },
          {
            role: "user",
            content: [
              `Issue title: ${input.issueTitle}`,
              `Issue body: ${input.issueBody}`,
              input.retryFailureLog
                ? `Previous validation failure:\n${input.retryFailureLog}`
                : "",
              `Files/context:\n${context}`,
            ].join("\n\n"),
          },
        ],
      });
      const content = response.choices[0]?.message.content ?? "";
      const parsed = JSON.parse(extractJsonObject(content)) as unknown;

      logger.debug({ contentLength: content.length }, "Generated patch draft");
      return normalizePatchDraft(parsed);
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

      try {
        await writeFile(patchPath, patch, "utf8");
        await execFileAsync("git", ["-C", repositoryPath, "apply", "--check", patchPath], {
          maxBuffer: 1024 * 1024 * 10,
        });
        await execFileAsync("git", ["-C", repositoryPath, "apply", patchPath], {
          maxBuffer: 1024 * 1024 * 10,
        });

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

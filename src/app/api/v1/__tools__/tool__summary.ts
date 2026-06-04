import { withSyncToolLogging } from "@/utils";
import OpenAI from "openai";
import { z } from "zod";
import type { ValidationResult } from "./tool__validation";

export const TOOL_EXPLAIN_DIFF = "explainDiff";
export const TOOL_GENERATE_PR_SUMMARY = "generatePrSummary";

export const DiffExplanationSchema = z.object({
  summary: z.string(),
  changedFiles: z.array(z.string()),
  testNotes: z.string(),
  publicApiImpact: z.string(),
});

export const PrSummarySchema = z.object({
  title: z.string(),
  body: z.string(),
});

export type DiffExplanation = z.infer<typeof DiffExplanationSchema>;
export type PrSummary = z.infer<typeof PrSummarySchema>;

// These tools are used in the final step of the agent workflow to generate a human-friendly explanation of the raw git diff and a PR summary (title and body) that can be used when creating the PR. The explanations and summaries are based on the issue details, the list of changed files, and the results of validation tests, providing important context for reviewers before approving the PR creation.
export const DEF_EXPLAIN_DIFF: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_EXPLAIN_DIFF,
    description:
      "Explains the raw git diff separately from the diff itself for reviewer approval.",
    parameters: {
      type: "object",
      properties: {
        rawDiff: { type: "string" },
        changedFiles: { type: "array", items: { type: "string" } },
      },
      required: ["rawDiff", "changedFiles"],
      additionalProperties: false,
    },
  },
};

export const DEF_GENERATE_PR_SUMMARY: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_GENERATE_PR_SUMMARY,
      description: "Generates a PR title and body from the issue, diff, and tests.",
      parameters: {
        type: "object",
        properties: {
          issueTitle: { type: "string" },
          issueUrl: { type: "string" },
          changedFiles: { type: "array", items: { type: "string" } },
          validationPassed: { type: "boolean" },
        },
        required: ["issueTitle", "issueUrl", "changedFiles", "validationPassed"],
        additionalProperties: false,
      },
    },
  };

export function explainDiff({
  rawDiff,
  changedFiles,
  validationResult,
}: {
  rawDiff: string;
  changedFiles: string[];
  validationResult: ValidationResult | null;
}) {
  return withSyncToolLogging(
    TOOL_EXPLAIN_DIFF,
    { changedFilesCount: changedFiles.length },
    () =>
      DiffExplanationSchema.parse({
        summary: `Changed ${changedFiles.length} file(s). Review the raw diff before approving PR creation.`,
        changedFiles,
        testNotes: validationResult
          ? validationResult.passed
            ? "Validation passed."
            : "Validation failed; inspect captured command logs before continuing."
          : "Validation has not been run yet.",
        publicApiImpact: rawDiff.includes("type ") || rawDiff.includes("func ")
          ? "Potential Go API surface changed; review exported symbols carefully."
          : "No obvious public API impact detected from the diff summary.",
      }),
  );
}

export function generatePrSummary({
  issueTitle,
  issueUrl,
  changedFiles,
  validationResult,
}: {
  issueTitle: string;
  issueUrl: string;
  changedFiles: string[];
  validationResult: ValidationResult;
}) {
  return withSyncToolLogging(
    TOOL_GENERATE_PR_SUMMARY,
    { issueTitle, changedFilesCount: changedFiles.length },
    () =>
      PrSummarySchema.parse({
        title: `Fix: ${issueTitle}`,
        body: [
          "## Summary",
          `- Addresses ${issueUrl}`,
          `- Updates ${changedFiles.length} file(s): ${changedFiles.join(", ") || "none"}`,
          "",
          "## Tests",
          ...validationResult.commands.map(
            (command) =>
              `- ${command.passed ? "PASS" : "FAIL"} \`${command.command}\``,
          ),
          "",
          "## Risk Notes",
          validationResult.passed
            ? "- Validation passed."
            : "- Validation failed; this PR should remain draft until fixed.",
        ].join("\n"),
      }),
  );
}

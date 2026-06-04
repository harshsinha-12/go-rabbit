import { logger, withSyncToolLogging } from "@/utils";
import OpenAI from "openai";
import { z } from "zod";
import type { IssueDifficultyClassification } from "./tool__difficulty";
import type { RepositoryScan } from "./tool__repository_scan";

export const TOOL_GENERATE_FIX_PLAN = "generateFixPlan";

export const FixPlanSchema = z.object({
  issueSummary: z.string(),
  rootCauseHypothesis: z.string(),
  filesToInspect: z.array(z.string()),
  filesAllowedToModify: z.array(z.string()),
  testPlan: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]),
  publicApiImpact: z.string(),
  approvalMessage: z.string(),
});

export type FixPlan = z.infer<typeof FixPlanSchema>;

export const DEF_GENERATE_FIX_PLAN: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_GENERATE_FIX_PLAN,
      description:
        "Generates a human-approval-ready fix plan from the issue, difficulty classification, and repository scan context.",
      parameters: {
        type: "object",
        properties: {
          issueTitle: { type: "string" },
          issueBody: { type: "string" },
          difficulty: { type: "string", enum: ["small", "medium", "large"] },
          relevantFiles: { type: "array", items: { type: "string" } },
          relevantTests: { type: "array", items: { type: "string" } },
        },
        required: [
          "issueTitle",
          "issueBody",
          "difficulty",
          "relevantFiles",
          "relevantTests",
        ],
        additionalProperties: false,
      },
    },
  };

export type GenerateFixPlanInput = {
  issueTitle: string;
  issueBody: string;
  difficulty: IssueDifficultyClassification;
  repositoryScan: RepositoryScan;
};

export function generateFixPlan({
  issueTitle,
  issueBody,
  difficulty,
  repositoryScan,
}: GenerateFixPlanInput): FixPlan {
  return withSyncToolLogging(
    TOOL_GENERATE_FIX_PLAN,
    { issueTitle, difficulty: difficulty.difficulty },
    () => {
      logger.debug({ issueTitle, difficulty }, "Generating fix plan");

      const filesToInspect = Array.from(
        new Set([
          ...repositoryScan.relevantFiles.slice(0, 12),
          ...repositoryScan.relevantTests.slice(0, 8),
        ]),
      );

      const filesAllowedToModify =
        difficulty.difficulty === "large" ? [] : filesToInspect.slice(0, 10);

      return FixPlanSchema.parse({
        issueSummary: `${issueTitle}\n\n${issueBody || "No issue body provided."}`,
        rootCauseHypothesis:
          difficulty.difficulty === "small"
            ? "The issue likely maps to a localized docs, test, or minor behavior fix."
            : "The issue needs repository context from the listed files before making a localized change.",
        filesToInspect,
        filesAllowedToModify,
        testPlan: repositoryScan.detectedTestCommands,
        riskLevel:
          difficulty.difficulty === "large"
            ? "high"
            : difficulty.difficulty === "medium"
              ? "medium"
              : "low",
        publicApiImpact:
          difficulty.difficulty === "large"
            ? "Potential public API or architectural impact; block by default."
            : "No public API impact identified yet; confirm after inspecting files.",
        approvalMessage:
          difficulty.difficulty === "large"
            ? "Do not proceed without explicit human override."
            : "Review and approve this plan before any file edits are applied.",
      });
    },
  );
}

export const generateFixPlanTool = generateFixPlan;

import { logger, withSyncToolLogging } from "@/utils";
import OpenAI from "openai";
import { z } from "zod";

export const TOOL_CLASSIFY_ISSUE_DIFFICULTY = "classifyIssueDifficulty";

export const IssueDifficultySchema = z.enum(["small", "medium", "large"]);

export const IssueDifficultyClassificationSchema = z.object({
  difficulty: IssueDifficultySchema,
  shouldBlock: z.boolean(),
  reasons: z.array(z.string()).min(1),
  suggestedUserMessage: z.string(),
});

export type IssueDifficultyClassification = z.infer<
  typeof IssueDifficultyClassificationSchema
>;

export const DEF_CLASSIFY_ISSUE_DIFFICULTY: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_CLASSIFY_ISSUE_DIFFICULTY,
      description:
        "Classifies a GitHub issue as small, medium, or large so Go Rabbit can warn or block risky issues before cloning and planning.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "GitHub issue title.",
          },
          body: {
            type: "string",
            description: "GitHub issue body.",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "GitHub issue label names.",
          },
        },
        required: ["title", "body", "labels"],
        additionalProperties: false,
      },
    },
  };

export type ClassifyIssueDifficultyInput = {
  title: string;
  body: string;
  labels?: string[];
};

const LARGE_CUES = [
  "architecture",
  "breaking change",
  "breaking",
  "security",
  "redesign",
  "rewrite",
  "api redesign",
  "public api",
  "rfc",
  "proposal",
  "unclear",
];

const SMALL_CUES = [
  "docs",
  "documentation",
  "typo",
  "test",
  "unit test",
  "minor",
  "simple",
  "readme",
];

export function classifyIssueDifficulty({
  title,
  body,
  labels = [],
}: ClassifyIssueDifficultyInput): IssueDifficultyClassification {
  return withSyncToolLogging(
    TOOL_CLASSIFY_ISSUE_DIFFICULTY,
    { title, labels },
    () => {
      logger.debug({ title, labels }, "Classifying issue difficulty");

      const text = `${title}\n${body}\n${labels.join(" ")}`.toLowerCase();
      const largeMatches = LARGE_CUES.filter((cue) => text.includes(cue));
      const smallMatches = SMALL_CUES.filter((cue) => text.includes(cue));

      const classification =
        largeMatches.length > 0
          ? {
              difficulty: "large" as const,
              shouldBlock: true,
              reasons: largeMatches.map(
                (cue) => `Contains large-issue cue: ${cue}`,
              ),
              suggestedUserMessage:
                "This issue looks large or risky. Go Rabbit should block by default unless a human explicitly overrides it.",
            }
          : smallMatches.length > 0
            ? {
                difficulty: "small" as const,
                shouldBlock: false,
                reasons: smallMatches.map(
                  (cue) => `Contains small-issue cue: ${cue}`,
                ),
                suggestedUserMessage:
                  "This issue looks small enough for an agent-assisted run.",
              }
            : {
                difficulty: "medium" as const,
                shouldBlock: false,
                reasons: [
                  "No large-risk cues were found; issue likely needs localized code inspection.",
                ],
                suggestedUserMessage:
                  "This issue looks medium-sized and should continue with planning after repository scan.",
              };

      return IssueDifficultyClassificationSchema.parse(classification);
    },
  );
}

export const classifyIssueDifficultyTool = classifyIssueDifficulty;

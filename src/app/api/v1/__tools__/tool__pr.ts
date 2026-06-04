import { withToolLogging } from "@/utils";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import OpenAI from "openai";

const execFileAsync = promisify(execFile);

export const TOOL_CREATE_APPROVED_PR = "createApprovedPr";

// This tool is used in the final step of the agent workflow to create a draft GitHub PR using the GitHub CLI after user approval. It takes the PR title and body as input, creates the PR, and returns the URL of the created PR. This allows the agent to automatically open a PR for the user after they have approved the changes, streamlining the workflow from patch generation to PR creation.
export const DEF_CREATE_APPROVED_PR: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_CREATE_APPROVED_PR,
      description:
        "Creates a draft GitHub PR after user approval using gh pr create.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          approvedPr: { type: "boolean" },
        },
        required: ["repositoryPath", "title", "body", "approvedPr"],
        additionalProperties: false,
      },
    },
  };

export async function createApprovedPr({
  repositoryPath,
  title,
  body,
  approvedPr,
}: {
  repositoryPath: string;
  title: string;
  body: string;
  approvedPr: boolean;
}) {
  return withToolLogging(
    TOOL_CREATE_APPROVED_PR,
    { repositoryPath, approvedPr },
    async () => {
      if (!approvedPr) {
        throw new Error("PR cannot be created before user approval");
      }

      const { stdout } = await execFileAsync(
        "gh",
        ["pr", "create", "--draft", "--title", title, "--body", body],
        {
          cwd: repositoryPath,
          maxBuffer: 1024 * 1024 * 5,
        },
      );

      return { url: stdout.trim() };
    },
  );
}

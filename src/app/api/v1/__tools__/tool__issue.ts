import { fetchGitHubIssues } from "@/fetchers";
import { logger, withToolLogging } from "@/utils";
import OpenAI from "openai";
import { getApprovedRepository } from "./tool__repo";

export const TOOL_FETCH_GITHUB_ISSUES = "fetchGitHubIssues";

// This tool is used in the step of the agent workflow where the user has selected a GitHub repository and wants to fetch open issues from that repository. It first validates that the selected repository is on the approved list, then fetches open issues using the GitHub API. The fetched issues can be used in subsequent steps of the workflow, such as selecting an issue to work on or providing context for code changes.
export const DEF_FETCH_GITHUB_ISSUES: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_FETCH_GITHUB_ISSUES,
      description:
        "Confirms the selected repository is approved for Go Rabbit and fetches open GitHub issues from that repository.",
      parameters: {
        type: "object",
        properties: {
          selectedRepositoryFullName: {
            type: "string",
            description:
              "The approved repository selected by the user, for example spf13/cobra.",
          },
        },
        required: ["selectedRepositoryFullName"],
        additionalProperties: false,
      },
    },
  };

export type FetchGitHubIssuesInput = {
  selectedRepositoryFullName: string;
};

export async function fetchIssuesFromApprovedRepository({
  selectedRepositoryFullName,
}: FetchGitHubIssuesInput) {
  return withToolLogging(
    TOOL_FETCH_GITHUB_ISSUES,
    { selectedRepositoryFullName },
    async () => {
      logger.debug({ selectedRepositoryFullName }, "Fetching GitHub issues");

      const repository = getApprovedRepository(selectedRepositoryFullName);

      if (!repository) {
        logger.debug(
          { fullName: selectedRepositoryFullName },
          "Rejected issues request for unapproved repository",
        );
        throw new Error(
          `Repository is not approved for agent runs: ${selectedRepositoryFullName}`,
        );
      }

      const githubIssues = await fetchGitHubIssues(
        repository.owner,
        repository.repo,
      );
      const issues = githubIssues.filter((issue) => !issue.pull_request);

      logger.debug(
        {
          fullName: repository.fullName,
          issuesCount: issues.length,
        },
        "Fetched GitHub issues",
      );

      return {
        repository,
        issues: issues.map((issue) => ({
          number: issue.number,
          title: issue.title,
          body: issue.body ?? "",
          labels: issue.labels.map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color,
            description: label.description,
          })),
          state: issue.state,
          commentsCount: issue.comments,
          commentsUrl: issue.comments_url,
          url: issue.html_url,
          author: issue.user
            ? {
                login: issue.user.login,
                url: issue.user.html_url,
              }
            : null,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
        })),
      };
    },
  );
}

export const fetchGitHubIssuesTool = fetchIssuesFromApprovedRepository;

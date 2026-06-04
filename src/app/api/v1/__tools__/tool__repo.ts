import { APPROVED_GO_REPOSITORIES } from "@/config";
import { fetchGitHubRepository } from "@/fetchers";
import { logger } from "@/utils";
import OpenAI from "openai";

export type ApprovedRepositoryName =
  (typeof APPROVED_GO_REPOSITORIES)[number]["fullName"];

export type ApprovedRepository = (typeof APPROVED_GO_REPOSITORIES)[number];

export const TOOL_FETCH_APPROVED_REPOSITORY = "fetchApprovedRepository";

export const DEF_FETCH_APPROVED_REPOSITORY: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_FETCH_APPROVED_REPOSITORY,
      description:
        "Validates that a selected GitHub repository is approved for Go Rabbit agent runs, then fetches repository metadata from GitHub.",
      parameters: {
        type: "object",
        properties: {
          fullName: {
            type: "string",
            enum: APPROVED_GO_REPOSITORIES.map((repo) => repo.fullName),
            description:
              "The selected GitHub repository full name. Must be one of the approved Go repositories.",
          },
        },
        required: ["fullName"],
        additionalProperties: false,
      },
    },
  };

export type FetchApprovedRepositoryInput = {
  fullName: string;
};

export function listApprovedRepositories() {
  return APPROVED_GO_REPOSITORIES;
}

export function getApprovedRepository(
  fullName: string,
): ApprovedRepository | null {
  return (
    APPROVED_GO_REPOSITORIES.find((repo) => repo.fullName === fullName) ?? null
  );
}

export function isApprovedRepository(fullName: string) {
  return getApprovedRepository(fullName) !== null;
}

export async function fetchApprovedRepository({
  fullName,
}: FetchApprovedRepositoryInput) {
  logger.debug({ fullName }, "Fetching approved repository");

  const repository = getApprovedRepository(fullName);

  if (!repository) {
    logger.debug({ fullName }, "Rejected unapproved repository");
    throw new Error(`Repository is not approved for agent runs: ${fullName}`);
  }

  const githubRepository = await fetchGitHubRepository(
    repository.owner,
    repository.repo,
  );

  logger.debug(
    {
      fullName,
      defaultBranch: githubRepository.default_branch,
      openIssues: githubRepository.open_issues_count,
    },
    "Fetched approved repository",
  );

  return {
    approved: true,
    repository,
    githubRepository: {
      id: githubRepository.id,
      name: githubRepository.name,
      fullName: githubRepository.full_name,
      url: githubRepository.html_url,
      description: githubRepository.description,
      defaultBranch: githubRepository.default_branch,
      language: githubRepository.language,
      stars: githubRepository.stargazers_count,
      openIssues: githubRepository.open_issues_count,
    },
  };
}

export const fetchApprovedRepositoryTool = fetchApprovedRepository;

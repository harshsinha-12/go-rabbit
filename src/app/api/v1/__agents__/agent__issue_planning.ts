import { fetchGitHubIssue } from "@/fetchers";
import { logger, withAgentLogging } from "@/utils";
import { randomUUID } from "node:crypto";
import {
  classifyIssueDifficulty,
  generateFixPlan,
  getApprovedRepository,
  prepareLocalRepository,
  scanRepositoryForIssue,
} from "../__tools__";

export type ExecuteIssuePlanningAgentInput = {
  selectedRepositoryFullName: string;
  issueNumber: number;
  runId?: string;
  allowLargeIssue?: boolean;
};

export async function executeIssuePlanningAgent({
  selectedRepositoryFullName,
  issueNumber,
  runId = randomUUID(),
  allowLargeIssue = false,
}: ExecuteIssuePlanningAgentInput) {
  return withAgentLogging(
    "executeIssuePlanningAgent",
    { selectedRepositoryFullName, issueNumber, runId },
    async () => {
      logger.debug(
        { selectedRepositoryFullName, issueNumber, runId },
        "Starting issue planning agent",
      );

      const repository = getApprovedRepository(selectedRepositoryFullName);

      if (!repository) {
        throw new Error(
          `Repository is not approved for agent runs: ${selectedRepositoryFullName}`,
        );
      }

      const githubIssue = await fetchGitHubIssue(
        repository.owner,
        repository.repo,
        issueNumber,
      );

      const issue = {
        number: githubIssue.number,
        title: githubIssue.title,
        body: githubIssue.body ?? "",
        labels: githubIssue.labels.map((label) => label.name),
        state: githubIssue.state,
        url: githubIssue.html_url,
      };

      const difficulty = classifyIssueDifficulty({
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      });

      if (difficulty.shouldBlock && !allowLargeIssue) {
        return {
          runId,
          blocked: true,
          repository,
          issue,
          difficulty,
          localRepository: null,
          repositoryScan: null,
          fixPlan: null,
          nextAction:
            "Large issue detected. Ask for explicit human override before cloning, scanning, or planning.",
        };
      }

      const localRepository = await prepareLocalRepository({
        runId,
        repositoryUrl: repository.url,
        issueNumber: issue.number,
      });

      const repositoryScan = await scanRepositoryForIssue({
        repositoryPath: localRepository.repositoryPath,
        issueTitle: issue.title,
        issueBody: issue.body,
      });

      const fixPlan = generateFixPlan({
        issueTitle: issue.title,
        issueBody: issue.body,
        difficulty,
        repositoryScan,
      });

      return {
        runId: localRepository.runId,
        blocked: false,
        repository,
        issue,
        difficulty,
        localRepository,
        repositoryScan,
        fixPlan,
        nextAction: "Show fix plan in the UI and wait for human approval.",
      };
    },
  );
}

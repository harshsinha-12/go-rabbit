import { logger, withToolLogging } from "@/utils";
import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";

const execFileAsync = promisify(execFile);

export const TOOL_PREPARE_LOCAL_REPOSITORY = "prepareLocalRepository";

export const DEF_PREPARE_LOCAL_REPOSITORY: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_PREPARE_LOCAL_REPOSITORY,
      description:
        "Creates or reuses a local run workspace, clones the approved GitHub repository, and checks out an issue branch.",
      parameters: {
        type: "object",
        properties: {
          runId: {
            type: "string",
            description: "Stable run identifier.",
          },
          repositoryUrl: {
            type: "string",
            description: "Approved GitHub repository URL.",
          },
          issueNumber: {
            type: "number",
            description: "GitHub issue number used in the branch name.",
          },
        },
        required: ["runId", "repositoryUrl", "issueNumber"],
        additionalProperties: false,
      },
    },
  };

export type PrepareLocalRepositoryInput = {
  runId: string;
  repositoryUrl: string;
  issueNumber: number;
};

function sanitizeRunId(runId: string) {
  return runId.replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function exists(directoryPath: string) {
  try {
    await stat(directoryPath);
    return true;
  } catch {
    return false;
  }
}

function isMissingExecutableError(error: unknown, executable: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT" &&
    "path" in error &&
    (error as NodeJS.ErrnoException).path === executable
  );
}

async function assertGitAvailable() {
  try {
    await execFileAsync("git", ["--version"], {
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    if (isMissingExecutableError(error, "git")) {
      throw new Error(
        [
          "Contributor runs require the `git` CLI, but this deployment runtime cannot find it.",
          "The hosted Vercel serverless runtime is not suitable for full agent execution because Go Rabbit clones repositories, applies patches, validates with local commands, and creates PR branches.",
          "Run the contributor worker in a VM/container with `git`, `gh`, `go`, and `make` installed, or run Go Rabbit locally with those tools on PATH.",
        ].join("\n"),
      );
    }

    throw error;
  }
}

export async function prepareLocalRepository({
  runId,
  repositoryUrl,
  issueNumber,
}: PrepareLocalRepositoryInput) {
  const safeRunId = sanitizeRunId(runId);

  return withToolLogging(
    TOOL_PREPARE_LOCAL_REPOSITORY,
    { runId: safeRunId, repositoryUrl, issueNumber },
    async () => {
      const runPath = path.join(os.tmpdir(), "go-rabbit-runs", safeRunId);
      const repositoryPath = path.join(runPath, "repo");
      const branchName = `go-rabbit/issue-${issueNumber}`;

      logger.debug(
        { runId: safeRunId, repositoryUrl, issueNumber },
        "Preparing local repository",
      );

      await mkdir(runPath, { recursive: true });
      await assertGitAvailable();

      if (!(await exists(repositoryPath))) {
        await execFileAsync("git", ["clone", repositoryUrl, repositoryPath], {
          maxBuffer: 1024 * 1024 * 10,
        });
      }

      await execFileAsync("git", ["-C", repositoryPath, "fetch", "origin"], {
        maxBuffer: 1024 * 1024 * 10,
      });

      await execFileAsync(
        "git",
        ["-C", repositoryPath, "checkout", "-B", branchName],
        {
          maxBuffer: 1024 * 1024 * 10,
        },
      );

      return {
        runId: safeRunId,
        runPath,
        repositoryPath,
        branchName,
      };
    },
  );
}

export const prepareLocalRepositoryTool = prepareLocalRepository;

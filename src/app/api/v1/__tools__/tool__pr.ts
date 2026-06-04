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
        "Commits the approved local changes, pushes the run branch to the user's fork, and creates a draft GitHub PR after user approval.",
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

function getCommandOutput(error: unknown) {
  if (error && typeof error === "object") {
    const maybeError = error as {
      stdout?: unknown;
      stderr?: unknown;
      message?: unknown;
    };
    const stdout = typeof maybeError.stdout === "string" ? maybeError.stdout : "";
    const stderr = typeof maybeError.stderr === "string" ? maybeError.stderr : "";
    const message = typeof maybeError.message === "string" ? maybeError.message : "";

    return `${stdout}${stderr}${message ? `\n${message}` : ""}`.trim();
  }

  return error instanceof Error ? error.message : "Command failed";
}

async function execGit(repositoryPath: string, args: string[]) {
  return execFileAsync("git", ["-C", repositoryPath, ...args], {
    maxBuffer: 1024 * 1024 * 10,
  });
}

async function execGh(repositoryPath: string, args: string[]) {
  return execFileAsync("gh", args, {
    cwd: repositoryPath,
    maxBuffer: 1024 * 1024 * 10,
  });
}

function parseGitHubRemoteUrl(remoteUrl: string) {
  const trimmedUrl = remoteUrl.trim();
  const httpsMatch = trimmedUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/,
  );
  const sshMatch = trimmedUrl.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/);
  const match = httpsMatch ?? sshMatch;

  if (!match) {
    throw new Error(`Could not parse GitHub origin remote URL: ${trimmedUrl}`);
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

async function getOriginRepository(repositoryPath: string) {
  const { stdout } = await execGit(repositoryPath, ["remote", "get-url", "origin"]);
  return parseGitHubRemoteUrl(stdout);
}

async function ensureGitHubCliAuth(repositoryPath: string) {
  try {
    await execGh(repositoryPath, ["auth", "status"]);
  } catch (error) {
    throw new Error(
      [
        "GitHub CLI is not authenticated for PR creation.",
        "Run:",
        "gh auth login",
        "Then retry PR creation.",
        getCommandOutput(error),
      ].join("\n"),
    );
  }
}

async function ensureCommittedChanges(repositoryPath: string, title: string) {
  const { stdout: statusOutput } = await execGit(repositoryPath, [
    "status",
    "--porcelain",
  ]);

  if (!statusOutput.trim()) {
    return false;
  }

  await execGit(repositoryPath, ["add", "-A"]);
  await execGit(repositoryPath, [
    "-c",
    "user.name=Go Rabbit",
    "-c",
    "user.email=go-rabbit@example.local",
    "commit",
    "-m",
    title,
  ]);

  return true;
}

async function addOrSetRemote(
  repositoryPath: string,
  remoteName: string,
  remoteUrl: string,
) {
  try {
    await execGit(repositoryPath, ["remote", "add", remoteName, remoteUrl]);
  } catch {
    await execGit(repositoryPath, ["remote", "set-url", remoteName, remoteUrl]);
  }
}

async function ensureForkRemote(repositoryPath: string, githubLogin: string) {
  const forkRemoteName = "go-rabbit-fork";
  const originRepository = await getOriginRepository(repositoryPath);
  const originFullName = `${originRepository.owner}/${originRepository.repo}`;
  const expectedForkName = `${githubLogin}/${originRepository.repo}`;
  const expectedForkRemoteUrl = `https://github.com/${expectedForkName}.git`;

  try {
    const { stdout: currentForkRemoteUrl } = await execGit(repositoryPath, [
      "remote",
      "get-url",
      forkRemoteName,
    ]);
    const currentRemote = parseGitHubRemoteUrl(currentForkRemoteUrl);

    if (
      currentRemote.owner !== githubLogin ||
      currentRemote.repo !== originRepository.repo
    ) {
      await execGit(repositoryPath, [
        "remote",
        "set-url",
        forkRemoteName,
        expectedForkRemoteUrl,
      ]);
    }

    return { remoteName: forkRemoteName, headOwner: githubLogin };
  } catch {
    // Remote does not exist yet, or the old URL was malformed; create or attach it below.
  }

  try {
    await execGh(repositoryPath, ["repo", "view", expectedForkName]);
    await addOrSetRemote(repositoryPath, forkRemoteName, expectedForkRemoteUrl);
    return { remoteName: forkRemoteName, headOwner: githubLogin };
  } catch {
    // Fork may not exist yet, or token cannot see it. Try creating it below.
  }

  try {
    await execGh(repositoryPath, ["repo", "fork", originFullName, "--clone=false"]);
    await addOrSetRemote(repositoryPath, forkRemoteName, expectedForkRemoteUrl);
    return { remoteName: forkRemoteName, headOwner: githubLogin };
  } catch (cloneFalseForkError) {
    try {
      await execGh(repositoryPath, [
        "repo",
        "fork",
        "--remote",
        "--remote-name",
        forkRemoteName,
      ]);
      return { remoteName: forkRemoteName, headOwner: githubLogin };
    } catch (remoteForkError) {
      await addOrSetRemote(repositoryPath, forkRemoteName, expectedForkRemoteUrl);
      return {
        remoteName: forkRemoteName,
        headOwner: githubLogin,
        forkError: new Error(
          [
            "`gh repo fork <owner>/<repo> --clone=false` failed:",
            getCommandOutput(cloneFalseForkError),
            "",
            "`gh repo fork --remote --remote-name go-rabbit-fork` also failed:",
            getCommandOutput(remoteForkError),
          ].join("\n"),
        ),
      };
    }
  }
}

function getForkRecoveryMessage({
  githubLogin,
  originOwner,
  originRepo,
}: {
  githubLogin: string;
  originOwner: string;
  originRepo: string;
}) {
  return [
    "Fork creation failed. Most likely cause: GITHUB_TOKEN in .env.local is a fine-grained PAT,",
    "which GitHub blocks from creating forks. Fix one of two ways:",
    "",
    "Option A — create the fork once manually in your terminal, then retry:",
    "  unset GH_TOKEN GITHUB_TOKEN",
    `  gh repo fork ${originOwner}/${originRepo} --clone=false`,
    `  # Expected fork: https://github.com/${githubLogin}/${originRepo}`,
    "",
    "Option B — replace GITHUB_TOKEN in .env.local with a classic PAT (repo scope):",
    "  github.com/settings/tokens → Generate new token (classic) → check repo",
    "  This lets the app fork on its own every time.",
  ].join("\n");
}

async function pushBranchToFork({
  repositoryPath,
  branchName,
  forkRemoteName,
  committed,
  githubLogin,
  forkError,
}: {
  repositoryPath: string;
  branchName: string;
  forkRemoteName: string;
  committed: boolean;
  githubLogin: string;
  forkError?: unknown;
}) {
  try {
    await execGit(repositoryPath, ["push", "-u", forkRemoteName, branchName]);
  } catch (error) {
    const originRepository = await getOriginRepository(repositoryPath);
    const forkCreationNote = forkError
      ? `\nFork creation through GitHub CLI failed:\n${getCommandOutput(forkError)}`
      : "";

    throw new Error(
      [
        `Committed changes${committed ? "" : " were already present"}, but pushing branch \`${branchName}\` to fork remote \`${forkRemoteName}\` failed.`,
        "This usually means the authenticated GitHub account does not have a fork yet, or git push is not authenticated for that fork.",
        getForkRecoveryMessage({
          githubLogin,
          originOwner: originRepository.owner,
          originRepo: originRepository.repo,
        }),
        "",
        "Push error:",
        getCommandOutput(error),
        forkCreationNote,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function getDefaultBranch(repositoryPath: string) {
  try {
    const { stdout } = await execGit(repositoryPath, [
      "symbolic-ref",
      "--short",
      "refs/remotes/origin/HEAD",
    ]);
    const defaultBranch = stdout.trim().replace(/^origin\//, "");

    if (defaultBranch) {
      return defaultBranch;
    }
  } catch {
    // Fall back to common public repository default below.
  }

  return "main";
}

async function getManualPrUrl({
  repositoryPath,
  headOwner,
  branchName,
}: {
  repositoryPath: string;
  headOwner: string;
  branchName: string;
}) {
  const originRepository = await getOriginRepository(repositoryPath);
  const defaultBranch = await getDefaultBranch(repositoryPath);
  const encodedHead = encodeURIComponent(`${headOwner}:${branchName}`);

  return `https://github.com/${originRepository.owner}/${originRepository.repo}/compare/${defaultBranch}...${encodedHead}?expand=1`;
}

async function getCurrentBranch(repositoryPath: string) {
  const { stdout } = await execGit(repositoryPath, [
    "branch",
    "--show-current",
  ]);
  const branchName = stdout.trim();

  if (!branchName) {
    throw new Error("Cannot create PR from a detached HEAD checkout.");
  }

  return branchName;
}

async function getGitHubLogin(repositoryPath: string) {
  const { stdout } = await execGh(repositoryPath, [
    "api",
    "user",
    "--jq",
    ".login",
  ]);
  const login = stdout.trim();

  if (!login) {
    throw new Error("Could not resolve authenticated GitHub username.");
  }

  return login;
}

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

      await ensureGitHubCliAuth(repositoryPath);
      const branchName = await getCurrentBranch(repositoryPath);
      const committed = await ensureCommittedChanges(repositoryPath, title);
      const githubLogin = await getGitHubLogin(repositoryPath);
      const forkRemote = await ensureForkRemote(repositoryPath, githubLogin);

      await pushBranchToFork({
        repositoryPath,
        branchName,
        forkRemoteName: forkRemote.remoteName,
        committed,
        githubLogin,
        forkError: forkRemote.forkError,
      });

      try {
        const { stdout } = await execGh(
          repositoryPath,
          [
            "pr",
            "create",
            "--draft",
            "--head",
            `${forkRemote.headOwner}:${branchName}`,
            "--title",
            title,
            "--body",
            body,
          ],
        );

        return { url: stdout.trim(), manual: false };
      } catch (error) {
        const manualUrl = await getManualPrUrl({
          repositoryPath,
          headOwner: forkRemote.headOwner,
          branchName,
        });

        return {
          url: manualUrl,
          manual: true,
          message: [
            "Branch was pushed, but GitHub CLI could not create the PR through GraphQL.",
            "Open the returned compare URL to create the PR manually.",
            getCommandOutput(error),
          ].join("\n"),
        };
      }
    },
  );
}

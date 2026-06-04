const GITHUB_ISSUE_PATTERN =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/;

export type ParsedGitHubIssueUrl = {
  owner: string;
  repo: string;
  issueNumber: number;
  fullName: string;
};

export function parseGitHubIssueUrl(
  issueUrl: string,
): ParsedGitHubIssueUrl | null {
  const match = issueUrl.match(GITHUB_ISSUE_PATTERN);

  if (!match) {
    return null;
  }

  const [, owner, repo, issueNumber] = match;

  return {
    owner,
    repo,
    issueNumber: Number(issueNumber),
    fullName: `${owner}/${repo}`,
  };
}

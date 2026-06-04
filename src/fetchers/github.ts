import { getRequiredEnv } from "@/utils"

export type GitHubIssueLabel = {
  id: number
  name: string
  color: string
  description: string | null
}

export type GitHubIssueResponse = {
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  labels: GitHubIssueLabel[]
  comments: number
  comments_url: string
  pull_request?: unknown
  user: {
    login: string
    html_url: string
  } | null
  created_at: string
  updated_at: string
}

export type GitHubIssueCommentResponse = {
  id: number
  body: string | null
  html_url: string
  user: {
    login: string
    html_url: string
  } | null
  created_at: string
  updated_at: string
}

export type GitHubRepositoryResponse = {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  default_branch: string
  language: string | null
  stargazers_count: number
  open_issues_count: number
}

function getGitHubHeaders() {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  return headers
}

export async function fetchGitHubRepository(owner: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: getGitHubHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub repository: ${response.status}`)
  }

  return (await response.json()) as GitHubRepositoryResponse
}

export async function fetchGitHubIssue(
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      headers: {
        ...getGitHubHeaders(),
        Authorization: `Bearer ${getRequiredEnv("GITHUB_TOKEN")}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub issue: ${response.status}`)
  }

  return (await response.json()) as GitHubIssueResponse
}

export async function fetchGitHubIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=50`,
    {
      headers: {
        ...getGitHubHeaders(),
        Authorization: `Bearer ${getRequiredEnv("GITHUB_TOKEN")}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub issue comments: ${response.status}`)
  }

  return (await response.json()) as GitHubIssueCommentResponse[]
}

export async function fetchGitHubIssues(owner: string, repo: string) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=30`,
    {
      headers: {
        ...getGitHubHeaders(),
        Authorization: `Bearer ${getRequiredEnv("GITHUB_TOKEN")}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub issues: ${response.status}`)
  }

  return (await response.json()) as GitHubIssueResponse[]
}

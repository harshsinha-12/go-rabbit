"use client"

import { APPROVED_GO_REPOSITORIES } from "@/config"
import { useState } from "react"

type ApprovedRepositoryFullName =
  (typeof APPROVED_GO_REPOSITORIES)[number]["fullName"]

type GitHubIssueOption = {
  number: number
  title: string
  state: string
  labels: Array<{
    name: string
  }>
  url: string
}

type FetchIssuesResponse = {
  issues: GitHubIssueOption[]
}

type AgentRunResponse = {
  blocked: boolean
  issue: {
    number: number
    title: string
  }
  difficulty: {
    difficulty: "small" | "medium" | "large"
    suggestedUserMessage: string
  }
  fixPlan: {
    approvalMessage: string
    filesToInspect: string[]
    testPlan: string[]
  } | null
  nextAction: string
}

export function RunSetupForm() {
  const [selectedRepositoryFullName, setSelectedRepositoryFullName] = useState(
    APPROVED_GO_REPOSITORIES[0].fullName as ApprovedRepositoryFullName,
  )
  const [issues, setIssues] = useState<GitHubIssueOption[]>([])
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(
    null,
  )
  const [isFetchingIssues, setIsFetchingIssues] = useState(false)
  const [isPreparingRun, setIsPreparingRun] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<AgentRunResponse | null>(null)

  async function handleFetchIssues() {
    setError(null)
    setRunResult(null)
    setIsFetchingIssues(true)

    try {
      const response = await fetch("/api/v1/issues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedRepositoryFullName,
        }),
      })
      const data = (await response.json()) as
        | FetchIssuesResponse
        | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to fetch issues")
      }

      const nextIssues = "issues" in data ? data.issues : []
      setIssues(nextIssues)
      setSelectedIssueNumber(nextIssues[0]?.number ?? null)
    } catch (nextError) {
      setIssues([])
      setSelectedIssueNumber(null)
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to fetch issues",
      )
    } finally {
      setIsFetchingIssues(false)
    }
  }

  async function handlePrepareRun() {
    if (!selectedIssueNumber) {
      setError("Select an issue before preparing the agent run.")
      return
    }

    setError(null)
    setRunResult(null)
    setIsPreparingRun(true)

    try {
      const response = await fetch("/api/v1/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedRepositoryFullName,
          issueNumber: selectedIssueNumber,
        }),
      })
      const data = (await response.json()) as AgentRunResponse | { error?: string }

      if (!response.ok) {
        throw new Error(
          "error" in data ? data.error : "Failed to prepare agent run",
        )
      }

      setRunResult(data as AgentRunResponse)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to prepare agent run",
      )
    } finally {
      setIsPreparingRun(false)
    }
  }

  return (
    <section className="panel">
      <h2>Run Setup</h2>
      <label>
        Repository
        <select
          value={selectedRepositoryFullName}
          onChange={(event) => {
            setSelectedRepositoryFullName(
              event.target.value as ApprovedRepositoryFullName,
            )
            setIssues([])
            setSelectedIssueNumber(null)
            setRunResult(null)
            setError(null)
          }}
        >
          {APPROVED_GO_REPOSITORIES.map((repo) => (
            <option key={repo.fullName} value={repo.fullName}>
              {repo.fullName}
            </option>
          ))}
        </select>
      </label>
      <input
        name="selectedRepositoryFullName"
        type="hidden"
        value={selectedRepositoryFullName}
      />
      <button
        disabled={isFetchingIssues}
        onClick={handleFetchIssues}
        type="button"
      >
        {isFetchingIssues ? "Fetching Issues..." : "Fetch Open Issues"}
      </button>

      {issues.length > 0 ? (
        <label className="issue-select-label">
          Issue
          <select
            value={selectedIssueNumber ?? ""}
            onChange={(event) =>
              setSelectedIssueNumber(Number(event.target.value))
            }
          >
            {issues.map((issue) => (
              <option key={issue.number} value={issue.number}>
                #{issue.number} {issue.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {issues.length > 0 ? (
        <button
          disabled={isPreparingRun || !selectedIssueNumber}
          onClick={handlePrepareRun}
          type="button"
        >
          {isPreparingRun ? "Preparing Run..." : "Prepare Agent Run"}
        </button>
      ) : null}

      {error ? <p className="form-message error-message">{error}</p> : null}

      {runResult ? (
        <div className="run-result">
          <p className="result-kicker">
            #{runResult.issue.number} {runResult.issue.title}
          </p>
          <p>
            Difficulty: <strong>{runResult.difficulty.difficulty}</strong>
          </p>
          <p>{runResult.difficulty.suggestedUserMessage}</p>
          <p>{runResult.nextAction}</p>
          {runResult.fixPlan ? (
            <p>{runResult.fixPlan.approvalMessage}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

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
  runId: string
  blocked: boolean
  localRepository: {
    repositoryPath: string
  } | null
  issue: {
    number: number
    title: string
    body?: string
    url?: string
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

type PatchDraftResponse = {
  patchDraft: {
    patch: string
    changedFiles: string[]
    rationale: string
    risks: string[]
  }
}

type ApplyPatchResponse = {
  changedFiles: string[]
  rawDiff: string
  rationale: string
}

type ValidationResult = {
  passed: boolean
  commands: Array<{
    command: string
    passed: boolean
    output: string
  }>
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
  const [approvedPlan, setApprovedPlan] = useState(false)
  const [patchDraft, setPatchDraft] =
    useState<PatchDraftResponse["patchDraft"] | null>(null)
  const [appliedPatch, setAppliedPatch] = useState<ApplyPatchResponse | null>(
    null,
  )
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null)
  const [prSummary, setPrSummary] = useState<{
    title: string
    body: string
  } | null>(null)
  const [diffExplanation, setDiffExplanation] = useState<{
    summary: string
    testNotes: string
    publicApiImpact: string
  } | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)

  async function handleFetchIssues() {
    setError(null)
    setRunResult(null)
    setApprovedPlan(false)
    setPatchDraft(null)
    setAppliedPatch(null)
    setValidationResult(null)
    setPrSummary(null)
    setDiffExplanation(null)
    setPrUrl(null)
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

  async function handleApprovePlan() {
    if (!runResult?.fixPlan) {
      return
    }

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/approve-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: runResult.runId,
          approvedPlan: true,
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to approve plan")
      }

      setApprovedPlan(true)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to approve plan",
      )
    }
  }

  async function handleGeneratePatch() {
    if (!runResult?.fixPlan || !runResult.localRepository || !approvedPlan) {
      return
    }

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/generate-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedPlan: true,
          repositoryPath: runResult.localRepository.repositoryPath,
          issueTitle: runResult.issue.title,
          issueBody: runResult.issue.body ?? "",
          filesToInspect: runResult.fixPlan.filesToInspect,
        }),
      })
      const data = (await response.json()) as PatchDraftResponse | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to generate patch")
      }

      setPatchDraft((data as PatchDraftResponse).patchDraft)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to generate patch",
      )
    }
  }

  async function handleApplyPatch() {
    if (!runResult?.localRepository || !patchDraft) {
      return
    }

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/apply-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryPath: runResult.localRepository.repositoryPath,
          patch: patchDraft.patch,
          rationale: patchDraft.rationale,
          approvedPatch: true,
        }),
      })
      const data = (await response.json()) as ApplyPatchResponse | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to apply patch")
      }

      setAppliedPatch(data as ApplyPatchResponse)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to apply patch",
      )
    }
  }

  async function handleRunValidation() {
    if (!runResult?.localRepository || !runResult.fixPlan) {
      return
    }

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryPath: runResult.localRepository.repositoryPath,
          commands: runResult.fixPlan.testPlan,
        }),
      })
      const data = (await response.json()) as
        | { validationResult: ValidationResult }
        | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to run validation")
      }

      setValidationResult((data as { validationResult: ValidationResult }).validationResult)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to run validation",
      )
    }
  }

  async function handleGeneratePrSummary() {
    if (!runResult || !appliedPatch || !validationResult) {
      return
    }

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/pr-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueTitle: runResult.issue.title,
          issueUrl: runResult.issue.url ?? "",
          changedFiles: appliedPatch.changedFiles,
          validationResult,
        }),
      })
      const data = (await response.json()) as
        | { prSummary: { title: string; body: string } }
        | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to create summary")
      }

      setPrSummary((data as { prSummary: { title: string; body: string } }).prSummary)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to create summary",
      )
    }
  }

  async function handleRetryPatch() {
    if (!runResult?.fixPlan || !runResult.localRepository || !validationResult) {
      return
    }

    const failureLog = validationResult.commands
      .filter((command) => !command.passed)
      .map((command) => `${command.command}\n${command.output}`)
      .join("\n\n")

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryPath: runResult.localRepository.repositoryPath,
          issueTitle: runResult.issue.title,
          issueBody: runResult.issue.body ?? "",
          filesToInspect: runResult.fixPlan.filesToInspect,
          retryFailureLog: failureLog || "Validation failed without output.",
          retryAttempt: 1,
        }),
      })
      const data = (await response.json()) as PatchDraftResponse | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to retry patch")
      }

      setPatchDraft((data as PatchDraftResponse).patchDraft)
      setAppliedPatch(null)
      setValidationResult(null)
      setDiffExplanation(null)
      setPrSummary(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to retry")
    }
  }

  async function handleExplainDiff() {
    if (!appliedPatch) {
      return
    }

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/explain-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawDiff: appliedPatch.rawDiff,
          changedFiles: appliedPatch.changedFiles,
          validationResult,
        }),
      })
      const data = (await response.json()) as
        | {
            explanation: {
              summary: string
              testNotes: string
              publicApiImpact: string
            }
          }
        | { error?: string }

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Failed to explain diff")
      }

      setDiffExplanation(
        (data as {
          explanation: {
            summary: string
            testNotes: string
            publicApiImpact: string
          }
        }).explanation,
      )
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to explain diff",
      )
    }
  }

  async function handleCreatePr() {
    if (!runResult?.localRepository || !prSummary) {
      return
    }

    setError(null)

    try {
      const response = await fetch("/api/v1/runs/create-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryPath: runResult.localRepository.repositoryPath,
          title: prSummary.title,
          body: prSummary.body,
          approvedPr: true,
        }),
      })
      const data = (await response.json()) as { url?: string; error?: string }

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create PR")
      }

      setPrUrl(data.url ?? null)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to create PR",
      )
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
            setApprovedPlan(false)
            setPatchDraft(null)
            setAppliedPatch(null)
            setValidationResult(null)
            setPrSummary(null)
            setDiffExplanation(null)
            setPrUrl(null)
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
          {runResult.fixPlan ? (
            <div className="action-stack">
              <button onClick={handleApprovePlan} type="button">
                {approvedPlan ? "Plan Approved" : "Approve Plan"}
              </button>
              {approvedPlan ? (
                <button onClick={handleGeneratePatch} type="button">
                  Generate Patch Draft
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {patchDraft ? (
        <div className="run-result">
          <p className="result-kicker">Approve Patch</p>
          <p>{patchDraft.rationale}</p>
          <pre>{patchDraft.patch}</pre>
          <button onClick={handleApplyPatch} type="button">
            Apply Approved Patch
          </button>
        </div>
      ) : null}

      {appliedPatch ? (
        <div className="run-result">
          <p className="result-kicker">Patch Applied</p>
          <p>Changed files: {appliedPatch.changedFiles.join(", ")}</p>
          <button onClick={handleRunValidation} type="button">
            Run Validation
          </button>
          <button onClick={handleExplainDiff} type="button">
            Explain Diff
          </button>
        </div>
      ) : null}

      {validationResult ? (
        <div className="run-result">
          <p className="result-kicker">
            Validation {validationResult.passed ? "Passed" : "Failed"}
          </p>
          {validationResult.commands.map((command) => (
            <p key={command.command}>
              {command.passed ? "PASS" : "FAIL"} {command.command}
            </p>
          ))}
          {!validationResult.passed ? (
            <button onClick={handleRetryPatch} type="button">
              Retry Patch Once
            </button>
          ) : null}
          <button onClick={handleExplainDiff} type="button">
            Explain Diff
          </button>
          <button onClick={handleGeneratePrSummary} type="button">
            Generate PR Summary
          </button>
        </div>
      ) : null}

      {diffExplanation ? (
        <div className="run-result">
          <p className="result-kicker">Diff Explanation</p>
          <p>{diffExplanation.summary}</p>
          <p>{diffExplanation.testNotes}</p>
          <p>{diffExplanation.publicApiImpact}</p>
        </div>
      ) : null}

      {prSummary ? (
        <div className="run-result">
          <p className="result-kicker">{prSummary.title}</p>
          <pre>{prSummary.body}</pre>
          <button onClick={handleCreatePr} type="button">
            Open Draft PR
          </button>
          {prUrl ? <p>PR: {prUrl}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

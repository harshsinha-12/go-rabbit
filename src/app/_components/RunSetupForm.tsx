"use client"

import {
  AGENTIC_RUN_ENDPOINT,
  APPROVED_GO_REPOSITORIES,
  CREATE_PR_ENDPOINT,
} from "@/config"
import { AGENT_RUN_STAGES } from "@/config"
import { useState } from "react"

type ApprovedRepositoryFullName =
  (typeof APPROVED_GO_REPOSITORIES)[number]["fullName"]

type GitHubIssueOption = {
  number: number
  title: string
  state: string
  labels: Array<{ name: string }>
  url: string
}

type FetchIssuesResponse = {
  issues: GitHubIssueOption[]
}

type AgentTraceEvent = {
  step: string
  status: "started" | "running" | "completed" | "failed" | "skipped"
  message: string
  detail?: string
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

type PatchDraft = {
  patch: string
  changedFiles: string[]
  rationale: string
  risks: string[]
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
    skipped?: boolean
    timedOut?: boolean
    elapsedMs?: number
  }>
}

type DiffExplanation = {
  summary: string
  testNotes: string
  publicApiImpact: string
}

type PrSummary = {
  title: string
  body: string
}

type ContributorAgentResponse = {
  trace: AgentTraceEvent[]
  planningResult: AgentRunResponse
  patchDraft: PatchDraft | null
  appliedPatch: ApplyPatchResponse | null
  validationResult: ValidationResult | null
  diffExplanation: DiffExplanation | null
  prSummary: PrSummary | null
  nextAction: string
}

type ContributorAgentStreamEvent =
  | {
      type: "trace"
      event: AgentTraceEvent
    }
  | {
      type: "result"
      result: ContributorAgentResponse
    }
  | {
      type: "error"
      error: string
    }

type TerminalEvent = {
  id: number
  status: AgentTraceEvent["status"] | "info"
  message: string
  detail?: string
}

let terminalEventId = 0

function getIssueLabel(issue: GitHubIssueOption) {
  return `#${issue.number} ${issue.title}`
}

async function readContributorAgentStream({
  response,
  onTrace,
}: {
  response: Response
  onTrace: (event: AgentTraceEvent) => void
}) {
  if (!response.body) {
    throw new Error("Contributor agent response did not include a stream.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: ContributorAgentResponse | null = null

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) {
        continue
      }

      const event = JSON.parse(line) as ContributorAgentStreamEvent

      if (event.type === "trace") {
        onTrace(event.event)
      } else if (event.type === "result") {
        result = event.result
      } else if (event.type === "error") {
        throw new Error(event.error)
      }
    }
  }

  const finalLine = buffer.trim()

  if (finalLine) {
    const event = JSON.parse(finalLine) as ContributorAgentStreamEvent

    if (event.type === "trace") {
      onTrace(event.event)
    } else if (event.type === "result") {
      result = event.result
    } else if (event.type === "error") {
      throw new Error(event.error)
    }
  }

  if (!result) {
    throw new Error("Contributor agent stream ended without a result.")
  }

  return result
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
  const [isRunningAgent, setIsRunningAgent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<AgentRunResponse | null>(null)
  const [patchDraft, setPatchDraft] = useState<PatchDraft | null>(null)
  const [appliedPatch, setAppliedPatch] = useState<ApplyPatchResponse | null>(
    null,
  )
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null)
  const [prSummary, setPrSummary] = useState<PrSummary | null>(null)
  const [diffExplanation, setDiffExplanation] =
    useState<DiffExplanation | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [manualPrUrl, setManualPrUrl] = useState(false)
  const [terminalEvents, setTerminalEvents] = useState<TerminalEvent[]>([
    {
      id: terminalEventId++,
      status: "info",
      message: "Select a repository, fetch open issues, then run the contributor agent.",
    },
  ])

  function appendTerminal(
    status: TerminalEvent["status"],
    message: string,
    detail?: string,
  ) {
    setTerminalEvents((events) =>
      [
        ...events,
        {
          id: terminalEventId++,
          status,
          message,
          detail,
        },
      ].slice(-80),
    )
  }

  async function handleCopyTerminal() {
    const terminalText = terminalEvents
      .map((event) => {
        const lines = [`[${event.status.toUpperCase()}] ${event.message}`]

        if (event.detail) {
          lines.push(event.detail)
        }

        return lines.join("\n")
      })
      .join("\n\n")

    try {
      await navigator.clipboard.writeText(terminalText)
      appendTerminal("completed", "Terminal log copied to clipboard.")
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error
          ? nextError.message
          : "Failed to copy terminal log"
      appendTerminal("failed", "Terminal copy failed.", nextMessage)
    }
  }

  function resetRunState() {
    setRunResult(null)
    setPatchDraft(null)
    setAppliedPatch(null)
    setValidationResult(null)
    setPrSummary(null)
    setDiffExplanation(null)
    setPrUrl(null)
    setManualPrUrl(false)
    setError(null)
  }

  async function handleFetchIssues() {
    resetRunState()
    setIsFetchingIssues(true)
    appendTerminal(
      "started",
      `Fetching open issues for ${selectedRepositoryFullName}.`,
    )

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
      appendTerminal(
        "completed",
        `Fetched ${nextIssues.length} open issue(s).`,
        nextIssues[0] ? `Default selection: ${getIssueLabel(nextIssues[0])}` : undefined,
      )
    } catch (nextError) {
      setIssues([])
      setSelectedIssueNumber(null)
      const nextMessage =
        nextError instanceof Error
          ? nextError.message
          : "Failed to fetch issues"
      setError(nextMessage)
      appendTerminal("failed", "Issue fetch failed.", nextMessage)
    } finally {
      setIsFetchingIssues(false)
    }
  }

  async function handleRunAgent() {
    if (!selectedIssueNumber) {
      setError("Select an issue before running the contributor agent.")
      return
    }

    resetRunState()
    setIsRunningAgent(true)
    appendTerminal(
      "started",
      `Starting contributor agent for ${selectedRepositoryFullName}#${selectedIssueNumber}.`,
    )

    try {
      const response = await fetch(AGENTIC_RUN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedRepositoryFullName,
          issueNumber: selectedIssueNumber,
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(
          "error" in data ? data.error : "Contributor agent run failed",
        )
      }

      const result = await readContributorAgentStream({
        response,
        onTrace: (event) => {
          appendTerminal(event.status, event.message, event.detail)
        },
      })
      setRunResult(result.planningResult)
      setPatchDraft(result.patchDraft)
      setAppliedPatch(result.appliedPatch)
      setValidationResult(result.validationResult)
      setDiffExplanation(result.diffExplanation)
      setPrSummary(result.prSummary)
      appendTerminal("completed", result.nextAction)
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error
          ? nextError.message
          : "Contributor agent run failed"
      setError(nextMessage)
      appendTerminal("failed", "Contributor agent stopped.", nextMessage)
    } finally {
      setIsRunningAgent(false)
    }
  }

  async function handleCreatePr() {
    if (!runResult?.localRepository || !prSummary) {
      return
    }

    setError(null)
    appendTerminal(
      "started",
      "Creating draft PR manually with the generated title and body.",
      prSummary.title,
    )

    try {
      const response = await fetch(CREATE_PR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryPath: runResult.localRepository.repositoryPath,
          title: prSummary.title,
          body: prSummary.body,
          approvedPr: true,
        }),
      })
      const data = (await response.json()) as {
        url?: string
        error?: string
        manual?: boolean
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create PR")
      }

      setPrUrl(data.url ?? null)
      setManualPrUrl(Boolean(data.manual))
      appendTerminal(
        "completed",
        data.manual ? "Manual PR URL ready." : "Draft PR created.",
        data.message ?? data.url,
      )
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error ? nextError.message : "Failed to create PR"
      setError(nextMessage)
      appendTerminal("failed", "Draft PR creation failed.", nextMessage)
    }
  }

  return (
    <>
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
              resetRunState()
              appendTerminal(
                "info",
                `Repository selected: ${event.target.value}.`,
              )
            }}
          >
            {APPROVED_GO_REPOSITORIES.map((repo) => (
              <option key={repo.fullName} value={repo.fullName}>
                {repo.fullName}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={isFetchingIssues || isRunningAgent}
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
              onChange={(event) => {
                const nextIssueNumber = Number(event.target.value)
                setSelectedIssueNumber(nextIssueNumber)
                resetRunState()
                appendTerminal("info", `Issue selected: #${nextIssueNumber}.`)
              }}
            >
              {issues.map((issue) => (
                <option key={issue.number} value={issue.number}>
                  {getIssueLabel(issue)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {issues.length > 0 ? (
          <button
            disabled={isRunningAgent || !selectedIssueNumber}
            onClick={handleRunAgent}
            type="button"
          >
            {isRunningAgent ? "Agent Running..." : "Run Contributor Agent"}
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
            {runResult.fixPlan ? (
              <>
                <p>{runResult.fixPlan.approvalMessage}</p>
                <div className="metadata-grid">
                  <div>
                    <span>Files</span>
                    <p>{runResult.fixPlan.filesToInspect.join(", ") || "None"}</p>
                  </div>
                  <div>
                    <span>Validation</span>
                    <p>{runResult.fixPlan.testPlan.join(", ") || "None"}</p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {patchDraft ? (
          <div className="run-result">
            <p className="result-kicker">Patch Draft</p>
            <p>{patchDraft.rationale}</p>
            <pre>{patchDraft.patch}</pre>
          </div>
        ) : null}

        {appliedPatch ? (
          <div className="run-result">
            <p className="result-kicker">Patch Applied</p>
            <p>Changed files: {appliedPatch.changedFiles.join(", ") || "None"}</p>
            <pre>{appliedPatch.rawDiff}</pre>
          </div>
        ) : null}

        {validationResult ? (
          <div className="run-result">
            <p className="result-kicker">
              Validation {validationResult.passed ? "Passed" : "Failed"}
            </p>
            {validationResult.commands.map((command) => (
              <div className="validation-row" key={command.command}>
                <p>
                  {command.skipped ? "SKIP" : command.passed ? "PASS" : "FAIL"}{" "}
                  {command.command}
                  {command.elapsedMs
                    ? ` (${Math.round(command.elapsedMs / 1000)}s)`
                    : ""}
                </p>
                {!command.passed ? <pre>{command.output}</pre> : null}
              </div>
            ))}
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
            <button
              disabled={Boolean(prUrl) || isRunningAgent}
              onClick={handleCreatePr}
              type="button"
            >
              {prUrl
                ? manualPrUrl
                  ? "Manual PR URL Ready"
                  : "Draft PR Created"
                : "Open Draft PR"}
            </button>
            {prUrl ? (
              <p>
                {manualPrUrl ? "Manual PR URL" : "PR"}:{" "}
                <a href={prUrl}>{prUrl}</a>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel trace-panel">
        <h2>Agent Run Trace</h2>
        <ol className="trace-list">
          {AGENT_RUN_STAGES.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel terminal-panel">
        <h2>Agent Terminal</h2>
        <div className="terminal-window" aria-label="Agent terminal log">
          <div className="terminal-header">
            <div className="terminal-header-meta">
              <span>go-rabbit</span>
              <span>{isRunningAgent ? "running" : "idle"}</span>
            </div>
            <button className="terminal-copy-button" onClick={handleCopyTerminal} type="button">
              Copy
            </button>
          </div>
          <div className="terminal-body">
            {terminalEvents.map((event) => (
              <div className="terminal-line" data-status={event.status} key={event.id}>
                <p>
                  <span>{event.status}</span>
                  {event.message}
                </p>
                {event.detail ? <pre>{event.detail}</pre> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

import { MermaidDiagram } from "@/app/_components/MermaidDiagram"
import { RunSetupForm } from "@/app/_components/RunSetupForm"
import { AGENT_RUN_STAGES } from "@/config"
import Image from "next/image"

const ARCHITECTURE_DIAGRAM = `flowchart LR
  User["User"]
  UI["Next.js landing page and agent workspace"]
  RepoIssueApi["Repository and issue APIs"]
  GitHubRest["GitHub REST API"]
  RunApi["Contributor run API"]
  Planner["Issue planning agent"]
  IssueContext["Issue body and comments"]
  Clone["Temporary cloned repository"]
  Scanner["Repository scanner"]
  Grounding["Repo tree, nearby files, tests, go.mod, README"]
  PatchLLM["Patch generation LLM"]
  ApplyPatch["git apply check and patch repair"]
  Validation["Validation runner with 120s cap"]
  Repair["LLM repair loop on failed validation"]
  Summary["Diff explanation and PR summary"]
  Report["PDF report page"]
  DraftPr["Draft PR tool"]
  Fork["User fork remote"]
  PullRequest["GitHub draft PR or compare URL"]

  User --> UI
  UI --> RepoIssueApi --> GitHubRest
  UI --> RunApi --> Planner
  Planner --> GitHubRest
  Planner --> IssueContext
  Planner --> Clone
  Clone --> Scanner --> Grounding
  Grounding --> PatchLLM --> ApplyPatch
  ApplyPatch --> Validation
  Validation --> Summary
  Validation -- failure logs --> Repair --> PatchLLM
  Summary --> Report
  Summary --> DraftPr --> Fork --> PullRequest`

const SOCIAL_LINKS = [
  {
    href: "https://www.linkedin.com/in/harshsinha12/",
    label: "LinkedIn",
    name: "harshsinha12",
  },
  {
    href: "https://github.com/harshsinha-12",
    label: "GitHub",
    name: "harshsinha-12",
  },
  {
    href: "https://x.com/sinhaharsh12",
    label: "Twitter",
    name: "sinhaharsh12",
  },
]

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.98 3.5a1.98 1.98 0 1 1 0 3.96 1.98 1.98 0 0 1 0-3.96ZM3 8.5h3.96V21H3V8.5Zm6.54 0h3.8v1.71h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.09V21h-3.96v-5.47c0-1.31-.02-3-1.83-3-1.84 0-2.12 1.44-2.12 2.9V21H9.54V8.5Z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.02c-3.22.7-3.9-1.38-3.9-1.38-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.72 1.26 3.39.96.11-.74.4-1.26.73-1.55-2.57-.29-5.28-1.29-5.28-5.73 0-1.27.45-2.31 1.2-3.12-.12-.3-.52-1.48.11-3.08 0 0 .98-.31 3.2 1.19a11.06 11.06 0 0 1 5.83 0c2.22-1.5 3.2-1.19 3.2-1.19.63 1.6.23 2.78.11 3.08.75.81 1.2 1.85 1.2 3.12 0 4.45-2.72 5.43-5.3 5.71.42.36.8 1.08.8 2.18v3.23c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}

function TwitterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.9 2H22l-6.78 7.73L23.2 22h-6.27l-4.91-6.33L6.47 22H3.34l7.3-8.32L.8 2h6.42l4.45 5.78L18.9 2Zm-1.1 18h1.72L6.28 3.9H4.44L17.8 20Z" />
    </svg>
  )
}

export default function Home() {
  return (
    <main className="app-shell">
      <nav className="top-nav" aria-label="Primary navigation">
        <a className="brand-mark" href="#top" aria-label="Go Rabbit home">
          <span className="brand-mark__icon">
            <Image src="/icon.svg" alt="" width={48} height={48} priority />
          </span>
          Go Rabbit
        </a>
        <div className="top-nav__links">
          <a href="#workflow">Workflow</a>
          <a href="#architecture">Architecture</a>
          <a href="#setup">Setup</a>
          <a href="#workspace">Run Agent</a>
          <a href="#reporting">Reports</a>
        </div>
      </nav>

      <section className="hero-section" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AI contributor assistant</p>
          <h1>Go Rabbit turns focused Go issues into PR-ready changes</h1>
          <p className="summary">
            Choose an approved repository, pick an open issue, watch the agent
            scan, patch, validate, explain, and prepare a clean pull request
            summary.
          </p>
          <div className="hero-actions">
            <a className="button-link" href="#workspace">
              Start a run
            </a>
            <a className="button-link button-link--secondary" href="#workflow">
              View workflow
            </a>
          </div>
          <div className="hero-metrics" aria-label="Go Rabbit workflow metrics">
            <div>
              <span>4</span>
              Approved repos
            </div>
            <div>
              <span>12</span>
              Run stages
            </div>
            <div>
              <span>120s</span>
              Validation cap
            </div>
          </div>
        </div>

        <div className="hero-mockup" aria-label="Go Rabbit interface mockup">
          <div className="mockup-toolbar">
            <span></span>
            <span></span>
            <span></span>
            <p>go-rabbit.run</p>
          </div>
          <div className="mockup-body">
            <div className="mockup-panel mockup-panel--setup">
              <div className="mockup-label">Run Setup</div>
              <div className="mockup-select">golangci/golangci-lint</div>
              <div className="mockup-select">#6420 gosec: G602 false positive</div>
              <div className="mockup-button">Run Contributor Agent</div>
            </div>
            <div className="mockup-panel mockup-panel--terminal">
              <div className="terminal-mini-line terminal-mini-line--ok">
                <span>completed</span> repository scan complete
              </div>
              <div className="terminal-mini-line terminal-mini-line--run">
                <span>running</span> generating patch draft
              </div>
              <div className="terminal-mini-line terminal-mini-line--skip">
                <span>skipped</span> validation timed out after 120s
              </div>
              <div className="terminal-mini-line terminal-mini-line--ok">
                <span>completed</span> PR summary ready
              </div>
            </div>
            <div className="mockup-panel mockup-panel--summary">
              <div className="mockup-label">PR Summary</div>
              <p>Fix: gosec G602 false positive</p>
              <ul>
                <li>Changed package files</li>
                <li>Captured validation notes</li>
                <li>Prepared draft PR body</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-band" id="workflow">
        {AGENT_RUN_STAGES.slice(0, 4).map((stage, index) => (
          <div className="feature-item" key={stage}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{stage}</p>
          </div>
        ))}
      </section>

      <section className="architecture-section" id="architecture">
        <div>
          <p className="eyebrow">Architecture</p>
          <h2>How a selected issue becomes a reviewed patch</h2>
          <p>
            The browser stays focused on review and approvals. Server-side
            tools own GitHub access, temporary repository workspaces, model
            calls, validation commands, and PR creation.
          </p>
        </div>
        <div className="architecture-diagram" aria-label="Go Rabbit rendered Mermaid architecture diagram">
          <MermaidDiagram chart={ARCHITECTURE_DIAGRAM} />
        </div>
      </section>

      <section className="capability-section" id="review">
        <div>
          <p className="eyebrow">Review surface</p>
          <h2>Everything needed before a maintainer sees the PR</h2>
        </div>
        <div className="capability-grid">
          <div>
            <h3>Grounded context</h3>
            <p>Issue body, comments, repository tree, nearby files, and tests flow into patch generation.</p>
          </div>
          <div>
            <h3>Validation trace</h3>
            <p>Live command output, elapsed time, timeout skips, and retry logs remain visible in the terminal.</p>
          </div>
          <div>
            <h3>Clean export</h3>
            <p>PDF reports capture the PR summary, diff explanation, validation results, and CLI trace.</p>
          </div>
        </div>
      </section>

      <section className="report-preview-section" id="reporting">
        <div>
          <p className="eyebrow">Report preview</p>
          <h2>Review a saved Go Rabbit PDF report</h2>
          <p>
            This sample report shows the output format for an agent run:
            summary, changed files, validation notes, diff explanation, and raw
            trace.
          </p>
          <a
            className="button-link"
            href="/reports/gosec-g602-go-rabbit-report.pdf"
            rel="noreferrer"
            target="_blank"
          >
            Open sample report
          </a>
        </div>
        <div className="report-preview-frame">
          <iframe
            src="/reports/gosec-g602-go-rabbit-report.pdf#view=FitH"
            title="Fix gosec G602 false positive Go Rabbit report preview"
          />
        </div>
      </section>

      <section className="setup-section" id="setup">
        <div>
          <p className="eyebrow">Setup</p>
          <h2>Run locally in four steps</h2>
          <p>
            Go Rabbit needs Node, GitHub CLI auth, a GitHub token for issue
            reads, and model credentials for patch generation.
          </p>
        </div>
        <div className="setup-steps">
          <div>
            <span>01</span>
            <h3>Install</h3>
            <code>npm install</code>
          </div>
          <div>
            <span>02</span>
            <h3>Configure</h3>
            <code>cp .env.example .env.local</code>
          </div>
          <div>
            <span>03</span>
            <h3>Authenticate</h3>
            <code>gh auth login</code>
          </div>
          <div>
            <span>04</span>
            <h3>Start</h3>
            <code>npm run dev</code>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="workspace-heading" id="workspace">
          <div>
            <p className="eyebrow">Agent workspace</p>
            <h2>Run Go Rabbit</h2>
          </div>
          <p>
            Start with an approved repository and an open issue. The right-side
            terminal shows each useful agent event while the run is active.
          </p>
        </div>

        <div className="grid">
          <RunSetupForm />
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__brand">
          <span className="brand-mark__icon">
            <Image src="/icon.svg" alt="" width={48} height={48} />
          </span>
          <div>
            <p>Go Rabbit</p>
            <span>Agentic PR workflow for focused Go issues</span>
          </div>
        </div>

        <div className="site-footer__links" aria-label="Social links">
          {SOCIAL_LINKS.map((link) => (
            <a
              className="site-footer__link"
              href={link.href}
              key={link.href}
              rel="noreferrer"
              target="_blank"
            >
              <span className="site-footer__icon" aria-hidden="true">
                {link.label === "LinkedIn" ? (
                  <LinkedInIcon />
                ) : link.label === "GitHub" ? (
                  <GitHubIcon />
                ) : (
                  <TwitterIcon />
                )}
              </span>
              <span>
                <strong>{link.label}</strong>
                <small>{link.name}</small>
              </span>
            </a>
          ))}
        </div>
      </footer>
    </main>
  )
}

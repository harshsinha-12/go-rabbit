import { RunSetupForm } from "@/app/_components/RunSetupForm"
import { AGENT_RUN_STAGES } from "@/config"
import Image from "next/image"

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
    </main>
  )
}

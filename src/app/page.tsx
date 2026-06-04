import { RunSetupForm } from "@/app/_components/RunSetupForm"
import { AGENT_RUN_STAGES } from "@/config"

export default function Home() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="panel intro-panel">
          <p className="eyebrow">Go Rabbit</p>
          <h1>AI contributor assistant for focused Go issues</h1>
          <p className="summary">
            Select an approved open-source repository, paste an issue, review the
            plan, approve the patch, and export a PR-ready summary.
          </p>
        </div>

        <div className="grid">
          <RunSetupForm />

          <section className="panel">
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
        </div>
      </section>
    </main>
  )
}

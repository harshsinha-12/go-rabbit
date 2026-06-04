const approvedRepos = [
  "gin-gonic/gin",
  "spf13/cobra",
  "go-playground/validator",
  "golangci/golangci-lint",
]

const traceSteps = [
  "Parse issue",
  "Classify difficulty",
  "Find relevant files",
  "Read tests",
  "Generate fix plan",
  "Wait for approval",
  "Apply patch",
  "Run validation",
  "Explain diff",
  "Draft PR summary",
]

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
          <section className="panel">
            <h2>Run Setup</h2>
            <label>
              Repository
              <select defaultValue={approvedRepos[0]}>
                {approvedRepos.map((repo) => (
                  <option key={repo}>{repo}</option>
                ))}
              </select>
            </label>
            <label>
              GitHub issue URL
              <input placeholder="https://github.com/spf13/cobra/issues/0000" />
            </label>
            <button type="button">Prepare Agent Run</button>
          </section>

          <section className="panel">
            <h2>Agent Run Trace</h2>
            <ol className="trace-list">
              {traceSteps.map((step, index) => (
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

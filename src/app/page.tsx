import { RunSetupForm } from "@/app/_components/RunSetupForm"

export default function Home() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="panel intro-panel">
          <p className="eyebrow">Go Rabbit</p>
          <h1>AI contributor assistant for focused Go issues</h1>
          <p className="summary">
            Select an approved open-source repository, choose an open issue, let
            the agent prepare the patch and validation summary, then manually
            open a draft PR.
          </p>
        </div>

        <div className="grid">
          <RunSetupForm />
        </div>
      </section>
    </main>
  )
}

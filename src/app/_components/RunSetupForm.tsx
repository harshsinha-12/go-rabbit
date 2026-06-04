"use client"

import { APPROVED_GO_REPOSITORIES } from "@/config"
import { useState } from "react"

type ApprovedRepositoryFullName =
  (typeof APPROVED_GO_REPOSITORIES)[number]["fullName"]

export function RunSetupForm() {
  const [selectedRepositoryFullName, setSelectedRepositoryFullName] = useState(
    APPROVED_GO_REPOSITORIES[0].fullName as ApprovedRepositoryFullName,
  )

  return (
    <section className="panel">
      <h2>Run Setup</h2>
      <label>
        Repository
        <select
          value={selectedRepositoryFullName}
          onChange={(event) =>
            setSelectedRepositoryFullName(
              event.target.value as ApprovedRepositoryFullName,
            )
          }
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
      <button type="button">Fetch Issues</button>
    </section>
  )
}

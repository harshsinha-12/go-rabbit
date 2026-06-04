export type AgentRunDifficulty = "small" | "medium" | "large"

export type AgentRunTraceItem = {
  stage: string
  status: "pending" | "running" | "completed" | "failed"
  detail?: string
}

export type AgentRunPlan = {
  difficulty: AgentRunDifficulty
  summary: string
  likelyFiles: string[]
  validationCommands: string[]
}

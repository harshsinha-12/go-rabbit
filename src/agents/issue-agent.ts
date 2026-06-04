import { AGENT_RUN_STAGES } from "@/config"
import type { AgentRunTraceItem } from "./types"

export function createInitialAgentTrace(): AgentRunTraceItem[] {
  return AGENT_RUN_STAGES.map((stage) => ({
    stage,
    status: "pending",
  }))
}

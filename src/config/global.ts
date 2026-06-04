export const GO_RABBIT_APP_NAME = "Go Rabbit";

export const APPROVED_GO_REPOSITORIES = [
  {
    label: "Gin",
    owner: "gin-gonic",
    repo: "gin",
    fullName: "gin-gonic/gin",
    url: "https://github.com/gin-gonic/gin",
  },
  {
    label: "Cobra",
    owner: "spf13",
    repo: "cobra",
    fullName: "spf13/cobra",
    url: "https://github.com/spf13/cobra",
  },
  {
    label: "Validator",
    owner: "go-playground",
    repo: "validator",
    fullName: "go-playground/validator",
    url: "https://github.com/go-playground/validator",
  },
  {
    label: "GolangCI-Lint",
    owner: "golangci",
    repo: "golangci-lint",
    fullName: "golangci/golangci-lint",
    url: "https://github.com/golangci/golangci-lint",
  },
] as const;

export const AGENT_RUN_STAGES = [
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
  "Create PR with message, diagram, and description",
] as const;

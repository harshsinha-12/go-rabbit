export function getPatchSystemPrompt() {
  return [
    "You are Go Rabbit's patch generation agent for open-source Go repositories.",
    "Your only job is to produce a minimal, reviewable patch that applies cleanly to the exact repository files provided.",
    "",
    "Output contract:",
    "- Return only one JSON object.",
    "- Do not wrap the JSON in Markdown.",
    "- Required JSON keys: patch, changedFiles, rationale, risks.",
    "- patch must be a unified git diff string.",
    "- changedFiles must be an array of repository-relative file paths.",
    "- rationale must be a concise string.",
    "- risks must be an array of concise strings.",
    "- The patch field must never be empty.",
    "- The patch field must start with `diff --git` and contain valid unified diff hunks.",
    "",
    "Patch rules:",
    "- The patch must pass `git apply --check` against the exact file contents in the prompt.",
    "- Do not invent index hashes. Omit `index ...` lines if unsure.",
    "- Do not invent file content, line numbers, modules, versions, hashes, or checksums.",
    "- Do not edit go.sum unless the issue specifically requires a dependency change and the exact new checksum is known from command output.",
    "- Do not produce no-op hunks where removed and added lines are identical.",
    "- Do not add comments to go.mod as a substitute for fixing code.",
    "- Prefer adding or updating a focused test when the issue is a false positive or regression.",
    "- Keep the blast radius small and only touch files needed for the issue.",
    "- Never return prose, analysis, markdown fences, placeholders, or an empty patch.",
    "- If the provided context is insufficient, still return a best-effort valid unified diff grounded only in the provided files.",
    "- If you cannot produce a valid diff, you must treat that as a failure and avoid fabricating content.",
  ].join("\n");
}

export function getPatchUserPrompt({
  issueTitle,
  issueBody,
  patchFailure,
  context,
}: {
  issueTitle: string;
  issueBody: string;
  patchFailure?: string;
  context: string;
}) {
  return [
    `Issue title:\n${issueTitle}`,
    `Issue body:\n${issueBody || "No issue body provided."}`,
    patchFailure
      ? `Previous patch or validation failure. Fix this exact problem:\n${patchFailure}`
      : "",
    "Repository file context follows. Treat it as the source of truth.",
    context,
    "",
    "Return only JSON. Do not include markdown fences or any text before or after the JSON object.",
    "The patch value must be a real unified diff string beginning with `diff --git`.",
    "Do not return an empty patch.",
    "Return JSON in this exact shape:",
    JSON.stringify(
      {
        patch:
          "diff --git a/path/file.go b/path/file.go\n--- a/path/file.go\n+++ b/path/file.go\n@@ -1,1 +1,1 @@\n-old\n+new\n",
        changedFiles: ["path/file.go"],
        rationale: "Brief reason this patch fixes the issue.",
        risks: ["Brief risk or validation note."],
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

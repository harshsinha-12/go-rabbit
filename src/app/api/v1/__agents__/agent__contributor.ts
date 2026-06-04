import { withAgentLogging } from "@/utils";
import {
  applyApprovedPatch,
  explainDiff,
  generateFocusedPatch,
  generatePrSummary,
  runValidation,
} from "../__tools__";
import type { ValidationCommandEvent } from "../__tools__/tool__validation";
import { executeIssuePlanningAgent } from "./agent__issue_planning";

const MAX_PATCH_ITERATIONS = 5;

export type ContributorAgentTraceEvent = {
  step: string;
  status: "started" | "running" | "completed" | "failed" | "skipped";
  message: string;
  detail?: string;
};

export type ExecuteContributorAgentInput = {
  selectedRepositoryFullName: string;
  issueNumber: number;
  allowLargeIssue?: boolean;
  onTrace?: (event: ContributorAgentTraceEvent) => void;
};

function serializeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getFailedValidationLog(
  validationResult: Awaited<ReturnType<typeof runValidation>>,
) {
  return validationResult.commands
    .filter((command) => !command.passed && !command.skipped)
    .map((command) => `${command.command}\n${command.output}`)
    .join("\n\n");
}

function didValidationSkip(validationResult: Awaited<ReturnType<typeof runValidation>>) {
  return validationResult.commands.some((command) => command.skipped || command.timedOut);
}

function formatValidationCommands(
  validationResult: Awaited<ReturnType<typeof runValidation>>,
) {
  return validationResult.commands
    .map((command) => {
      const status = command.skipped ? "SKIP" : command.passed ? "PASS" : "FAIL";
      const elapsed = command.elapsedMs
        ? ` (${Math.round(command.elapsedMs / 1000)}s)`
        : "";
      return `${status} ${command.command}${elapsed}`;
    })
    .join("\n");
}

function createValidationTraceHandler(pushTrace: (event: ContributorAgentTraceEvent) => void) {
  return (event: ValidationCommandEvent) => {
    pushTrace({
      step: "validate",
      status:
        event.status === "output"
          ? "running"
          : event.status === "started"
            ? "started"
            : event.status,
      message: event.message,
      detail: event.output,
    });
  };
}

export async function executeContributorAgent(input: ExecuteContributorAgentInput) {
  const trace: ContributorAgentTraceEvent[] = [];
  const pushTrace = (event: ContributorAgentTraceEvent) => {
    trace.push(event);
    input.onTrace?.(event);
  };

  return withAgentLogging(
    "executeContributorAgent",
    {
      selectedRepositoryFullName: input.selectedRepositoryFullName,
      issueNumber: input.issueNumber,
    },
    async () => {
      try {
        pushTrace({
          step: "plan",
          status: "started",
          message: "Fetching issue, preparing workspace, scanning repository, and creating the fix plan.",
        });
        const planningResult = await executeIssuePlanningAgent(input);

        if (planningResult.blocked || !planningResult.fixPlan || !planningResult.localRepository) {
          pushTrace({
            step: "plan",
            status: planningResult.blocked ? "skipped" : "failed",
            message: planningResult.nextAction,
          });

          return {
            trace,
            planningResult,
            patchDraft: null,
            appliedPatch: null,
            validationResult: null,
            diffExplanation: null,
            prSummary: null,
            nextAction: planningResult.nextAction,
          };
        }

        pushTrace({
          step: "plan",
          status: "completed",
          message: planningResult.fixPlan.approvalMessage,
          detail: [
            `Issue: #${planningResult.issue.number} ${planningResult.issue.title}`,
            `Difficulty: ${planningResult.difficulty.difficulty}`,
            `Workspace: ${planningResult.localRepository.repositoryPath}`,
            `Files to inspect: ${planningResult.fixPlan.filesToInspect.join(", ") || "none"}`,
            `Validation commands: ${planningResult.fixPlan.testPlan.join(", ") || "none"}`,
          ].join("\n"),
        });

        pushTrace({
          step: "patch",
          status: "started",
          message: `Generating a git-apply-valid patch from the approved plan. Up to ${MAX_PATCH_ITERATIONS} repair attempt(s) are allowed.`,
        });
        let patchDraft = await generateFocusedPatch({
          repositoryPath: planningResult.localRepository.repositoryPath,
          issueTitle: planningResult.issue.title,
          issueBody: planningResult.issue.body,
          filesToInspect: planningResult.fixPlan.filesToInspect,
          repositoryTree: planningResult.repositoryScan?.repositoryTree,
          maxAttempts: MAX_PATCH_ITERATIONS,
          onAttempt: (attempt) => {
            pushTrace({
              step: "patch",
              status: attempt.passed ? "completed" : "failed",
              message: attempt.passed
                ? `Patch attempt ${attempt.attempt}/${MAX_PATCH_ITERATIONS} passed git apply --check.`
                : `Patch attempt ${attempt.attempt}/${MAX_PATCH_ITERATIONS} failed git apply --check.`,
              detail: attempt.passed
                ? `Changed files proposed: ${attempt.changedFiles.join(", ") || "unknown"}`
                : attempt.error,
            });
          },
        });
        pushTrace({
          step: "patch",
          status: "completed",
          message: patchDraft.rationale,
          detail: `Changed files proposed: ${patchDraft.changedFiles.join(", ") || "unknown"}`,
        });

        pushTrace({
          step: "apply",
          status: "started",
          message: "Applying generated patch with git apply --check first.",
        });
        let appliedPatch = await applyApprovedPatch({
          repositoryPath: planningResult.localRepository.repositoryPath,
          patch: patchDraft.patch,
          rationale: patchDraft.rationale,
          approvedPatch: true,
        });
        pushTrace({
          step: "apply",
          status: "completed",
          message: `Patch applied to ${appliedPatch.changedFiles.length} file(s).`,
          detail: [
            `Changed files: ${appliedPatch.changedFiles.join(", ") || "none"}`,
            `Diff size: ${appliedPatch.rawDiff.length} character(s)`,
          ].join("\n"),
        });

        pushTrace({
          step: "validate",
          status: "started",
          message: "Running validation commands.",
          detail: planningResult.fixPlan.testPlan
            .map((command) => `$ ${command}`)
            .join("\n"),
        });
        let validationResult = await runValidation({
          repositoryPath: planningResult.localRepository.repositoryPath,
          commands: planningResult.fixPlan.testPlan,
          onCommandEvent: createValidationTraceHandler(pushTrace),
        });
        pushTrace({
          step: "validate",
          status: validationResult.passed
            ? "completed"
            : didValidationSkip(validationResult)
              ? "skipped"
              : "failed",
          message: validationResult.passed
            ? "Validation passed."
            : didValidationSkip(validationResult)
              ? "Validation exceeded the 2 minute limit and was skipped. Continuing to diff explanation and PR summary."
            : `Validation failed; sending complete command output back to the patch agent. Up to ${MAX_PATCH_ITERATIONS} total patch cycle(s) are allowed.`,
          detail: formatValidationCommands(validationResult),
        });

        for (
          let patchCycle = 2;
          !validationResult.passed &&
          !didValidationSkip(validationResult) &&
          patchCycle <= MAX_PATCH_ITERATIONS;
          patchCycle += 1
        ) {
          const retryFailureLog =
            getFailedValidationLog(validationResult) || "Validation failed without output.";

          pushTrace({
            step: "retry",
            status: "started",
            message: `Sending validation failure log to the LLM and generating patch cycle ${patchCycle}/${MAX_PATCH_ITERATIONS}.`,
            detail: [
              `Failure log length sent to LLM: ${retryFailureLog.length} character(s)`,
              retryFailureLog.slice(0, 4000),
            ].join("\n\n"),
          });
          patchDraft = await generateFocusedPatch({
            repositoryPath: planningResult.localRepository.repositoryPath,
            issueTitle: planningResult.issue.title,
            issueBody: planningResult.issue.body,
            filesToInspect: planningResult.fixPlan.filesToInspect,
            repositoryTree: planningResult.repositoryScan?.repositoryTree,
            retryFailureLog,
            maxAttempts: MAX_PATCH_ITERATIONS,
            onAttempt: (attempt) => {
              pushTrace({
                step: "retry",
                status: attempt.passed ? "completed" : "failed",
                message: attempt.passed
                  ? `Repair attempt ${attempt.attempt}/${MAX_PATCH_ITERATIONS} passed git apply --check.`
                  : `Repair attempt ${attempt.attempt}/${MAX_PATCH_ITERATIONS} failed git apply --check.`,
                detail: attempt.passed
                  ? `Changed files proposed: ${attempt.changedFiles.join(", ") || "unknown"}`
                  : attempt.error,
              });
            },
          });
          appliedPatch = await applyApprovedPatch({
            repositoryPath: planningResult.localRepository.repositoryPath,
            patch: patchDraft.patch,
            rationale: patchDraft.rationale,
            approvedPatch: true,
          });
          validationResult = await runValidation({
            repositoryPath: planningResult.localRepository.repositoryPath,
            commands: planningResult.fixPlan.testPlan,
            onCommandEvent: createValidationTraceHandler(pushTrace),
          });
          pushTrace({
            step: "retry",
            status: validationResult.passed
              ? "completed"
              : didValidationSkip(validationResult)
                ? "skipped"
                : "failed",
            message: validationResult.passed
              ? `Patch cycle ${patchCycle}/${MAX_PATCH_ITERATIONS} validation passed.`
              : didValidationSkip(validationResult)
                ? "Validation exceeded the 2 minute limit. Skipping further retries and continuing."
              : patchCycle === MAX_PATCH_ITERATIONS
                ? "Patch cycles exhausted. Stopping with partial result."
                : `Patch cycle ${patchCycle}/${MAX_PATCH_ITERATIONS} validation failed; continuing.`,
            detail: formatValidationCommands(validationResult),
          });
        }

        const diffExplanation = explainDiff({
          rawDiff: appliedPatch.rawDiff,
          changedFiles: appliedPatch.changedFiles,
          validationResult,
        });
        pushTrace({
          step: "explain",
          status: "completed",
          message: diffExplanation.summary,
          detail: diffExplanation.testNotes,
        });

        const prSummary = generatePrSummary({
          issueTitle: planningResult.issue.title,
          issueUrl: planningResult.issue.url,
          changedFiles: appliedPatch.changedFiles,
          validationResult,
        });
        pushTrace({
          step: "pr-summary",
          status: "completed",
          message: "PR title and body are ready. Creating the PR remains a manual action.",
          detail: prSummary.title,
        });

        return {
          trace,
          planningResult,
          patchDraft,
          appliedPatch,
          validationResult,
          diffExplanation,
          prSummary,
          nextAction: "Review the generated PR summary, then click Open Draft PR when ready.",
        };
      } catch (error) {
        pushTrace({
          step: "agent",
          status: "failed",
          message: "Contributor agent failed.",
          detail: serializeError(error),
        });
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          trace,
        });
      }
    },
  );
}

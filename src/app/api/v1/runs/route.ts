import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/utils";
import { z } from "zod";
import { executeIssuePlanningAgent } from "../__agents__/agent__issue_planning";

export const runtime = "nodejs";

const CreateRunRequestSchema = z.object({
  selectedRepositoryFullName: z.string().min(1),
  issueNumber: z.number().int().positive(),
  runId: z.string().min(1).optional(),
  allowLargeIssue: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const parsedBody = CreateRunRequestSchema.safeParse(await request.json());
  logger.info({ route: "/api/v1/runs" }, "Agent run requested");

  if (!parsedBody.success) {
    logger.error(
      { route: "/api/v1/runs", issues: parsedBody.error.issues },
      "Invalid agent run request",
    );
    return NextResponse.json(
      {
        error: "Invalid run request",
        issues: parsedBody.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const result = await executeIssuePlanningAgent(parsedBody.data);
    logger.info(
      {
        route: "/api/v1/runs",
        selectedRepositoryFullName: parsedBody.data.selectedRepositoryFullName,
        issueNumber: parsedBody.data.issueNumber,
      },
      "Agent run completed",
    );
    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      { route: "/api/v1/runs", body: parsedBody.data, error },
      "Agent run failed",
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to execute issue planning agent",
      },
      { status: 500 },
    );
  }
}

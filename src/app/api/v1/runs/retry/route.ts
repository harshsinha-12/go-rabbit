import { generateFocusedPatch } from "@/app/api/v1/__tools__";
import { RETRY_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RetryRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  issueTitle: z.string().min(1),
  issueBody: z.string(),
  filesToInspect: z.array(z.string()).min(1),
  repositoryTree: z.string().optional(),
  retryFailureLog: z.string().min(1),
  retryAttempt: z.literal(1),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsedBody = RetryRequestSchema.safeParse(await request.json());
  logger.info({ route: RETRY_ENDPOINT }, "Retry patch requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid retry request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  try {
    const patchDraft = await generateFocusedPatch(parsedBody.data);
    return NextResponse.json({
      patchDraft,
      retryAttempt: 1,
      nextAction: "Display retry patch draft as Approve Patch.",
    });
  } catch (error) {
    logger.error({ route: RETRY_ENDPOINT, error }, "Retry patch failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry patch" },
      { status: 500 },
    );
  }
}

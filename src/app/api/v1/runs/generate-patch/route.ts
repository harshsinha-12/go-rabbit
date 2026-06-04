import { generateFocusedPatch } from "@/app/api/v1/__tools__";
import { GENERATE_PATCH_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GeneratePatchRequestSchema = z.object({
  approvedPlan: z.literal(true),
  repositoryPath: z.string().min(1),
  issueTitle: z.string().min(1),
  issueBody: z.string(),
  filesToInspect: z.array(z.string()).min(1),
  retryFailureLog: z.string().optional(),
});

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
      .join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to generate patch";
}

export async function POST(request: NextRequest) {
  const parsedBody = GeneratePatchRequestSchema.safeParse(await request.json());
  logger.info({ route: GENERATE_PATCH_ENDPOINT }, "Patch generation requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid patch generation request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  try {
    const patchDraft = await generateFocusedPatch(parsedBody.data);
    return NextResponse.json({
      patchDraft,
      nextAction: "Display patch draft in the UI as Approve Patch.",
    });
  } catch (error) {
    logger.error({ route: GENERATE_PATCH_ENDPOINT, error }, "Patch generation failed");
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

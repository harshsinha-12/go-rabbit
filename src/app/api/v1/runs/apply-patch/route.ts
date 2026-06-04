import { applyApprovedPatch } from "@/app/api/v1/__tools__";
import { APPLY_PATCH_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ApplyPatchRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  patch: z.string().min(1),
  rationale: z.string().min(1),
  approvedPatch: z.literal(true),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsedBody = ApplyPatchRequestSchema.safeParse(await request.json());
  logger.info({ route: APPLY_PATCH_ENDPOINT }, "Patch apply requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid patch apply request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await applyApprovedPatch(parsedBody.data);
    return NextResponse.json({
      ...result,
      nextAction: "Run validation.",
    });
  } catch (error) {
    logger.error({ route: APPLY_PATCH_ENDPOINT, error }, "Patch apply failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply patch" },
      { status: 500 },
    );
  }
}

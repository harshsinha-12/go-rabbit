import { APPROVE_PLAN_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ApprovePlanRequestSchema = z.object({
  runId: z.string().min(1),
  approvedPlan: z.boolean(),
});

export async function POST(request: NextRequest) {
  const parsedBody = ApprovePlanRequestSchema.safeParse(await request.json());
  logger.info({ route: APPROVE_PLAN_ENDPOINT }, "Plan approval requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid plan approval request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json({
    runId: parsedBody.data.runId,
    approvedPlan: parsedBody.data.approvedPlan,
    nextAction: parsedBody.data.approvedPlan
      ? "Generate patch draft for approval."
      : "Plan rejected. Do not generate or apply a patch.",
  });
}

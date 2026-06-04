import { createApprovedPr } from "@/app/api/v1/__tools__";
import { CREATE_PR_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CreatePrRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  approvedPr: z.literal(true),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsedBody = CreatePrRequestSchema.safeParse(await request.json());
  logger.info({ route: CREATE_PR_ENDPOINT }, "PR creation requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid PR creation request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await createApprovedPr(parsedBody.data);
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ route: CREATE_PR_ENDPOINT, error }, "PR creation failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create PR" },
      { status: 500 },
    );
  }
}

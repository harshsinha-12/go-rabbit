import { runValidation } from "@/app/api/v1/__tools__";
import { VALIDATE_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ValidateRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  commands: z.array(z.string().min(1)).default(["go test ./..."]),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsedBody = ValidateRequestSchema.safeParse(await request.json());
  logger.info({ route: VALIDATE_ENDPOINT }, "Validation requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid validation request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  try {
    const validationResult = await runValidation(parsedBody.data);
    return NextResponse.json({
      validationResult,
      nextAction: validationResult.passed
        ? "Explain diff and generate PR summary."
        : "Retry once with validation failure logs.",
    });
  } catch (error) {
    logger.error({ route: VALIDATE_ENDPOINT, error }, "Validation failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run validation" },
      { status: 500 },
    );
  }
}

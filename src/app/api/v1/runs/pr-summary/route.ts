import { generatePrSummary } from "@/app/api/v1/__tools__";
import { PR_SUMMARY_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PrSummaryRequestSchema = z.object({
  issueTitle: z.string().min(1),
  issueUrl: z.string().min(1),
  changedFiles: z.array(z.string()),
  validationResult: z.object({
    passed: z.boolean(),
    commands: z.array(
      z.object({
        command: z.string(),
        passed: z.boolean(),
        output: z.string(),
      }),
    ),
  }),
});

export async function POST(request: NextRequest) {
  const parsedBody = PrSummaryRequestSchema.safeParse(await request.json());
  logger.info({ route: PR_SUMMARY_ENDPOINT }, "PR summary requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid PR summary request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const prSummary = generatePrSummary(parsedBody.data);
  return NextResponse.json({
    prSummary,
    nextAction: "Show PR title/body and ask for approval before opening PR.",
  });
}

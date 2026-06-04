import { explainDiff } from "@/app/api/v1/__tools__";
import { EXPLAIN_DIFF_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ExplainDiffRequestSchema = z.object({
  rawDiff: z.string(),
  changedFiles: z.array(z.string()),
  validationResult: z
    .object({
      passed: z.boolean(),
      commands: z.array(
        z.object({
          command: z.string(),
          passed: z.boolean(),
          output: z.string(),
        }),
      ),
    })
    .nullable(),
});

export async function POST(request: NextRequest) {
  const parsedBody = ExplainDiffRequestSchema.safeParse(await request.json());
  logger.info({ route: EXPLAIN_DIFF_ENDPOINT }, "Diff explanation requested");

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid diff explanation request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const explanation = explainDiff(parsedBody.data);
  return NextResponse.json({ explanation });
}

import { AGENTIC_RUN_ENDPOINT } from "@/config/endpoint";
import { logger } from "@/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { executeContributorAgent } from "../../__agents__/agent__contributor";

export const runtime = "nodejs";

const AgenticRunRequestSchema = z.object({
  selectedRepositoryFullName: z.string().min(1),
  issueNumber: z.number().int().positive(),
  allowLargeIssue: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const parsedBody = AgenticRunRequestSchema.safeParse(await request.json());
  logger.info({ route: AGENTIC_RUN_ENDPOINT }, "Contributor agent run requested");

  if (!parsedBody.success) {
    logger.error(
      { route: AGENTIC_RUN_ENDPOINT, issues: parsedBody.error.issues },
      "Invalid contributor agent run request",
    );
    return NextResponse.json(
      { error: "Invalid contributor agent request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const result = await executeContributorAgent({
          ...parsedBody.data,
          onTrace: (event) => send({ type: "trace", event }),
        });
        logger.info(
          {
            route: AGENTIC_RUN_ENDPOINT,
            selectedRepositoryFullName: parsedBody.data.selectedRepositoryFullName,
            issueNumber: parsedBody.data.issueNumber,
          },
          "Contributor agent run completed",
        );
        send({ type: "result", result });
      } catch (error) {
        logger.error(
          { route: AGENTIC_RUN_ENDPOINT, body: parsedBody.data, error },
          "Contributor agent run failed",
        );
        send({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "Failed to execute contributor agent",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}

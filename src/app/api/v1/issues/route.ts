import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/utils";
import { fetchIssuesFromApprovedRepository } from "../__tools__/tool__issue";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    selectedRepositoryFullName?: unknown;
  };
  logger.info({ route: "/api/v1/issues", body }, "Issues fetch requested");

  if (
    typeof body.selectedRepositoryFullName !== "string" ||
    body.selectedRepositoryFullName.length === 0
  ) {
    return NextResponse.json(
      {
        error: "selectedRepositoryFullName is required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchIssuesFromApprovedRepository({
      selectedRepositoryFullName: body.selectedRepositoryFullName,
    });

    logger.info(
      {
        route: "/api/v1/issues",
        selectedRepositoryFullName: body.selectedRepositoryFullName,
      },
      "Issues fetch completed",
    );
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ route: "/api/v1/issues", body, error }, "Issues fetch failed");
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch GitHub issue",
      },
      { status: 400 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/utils";
import {
  fetchApprovedRepository,
  listApprovedRepositories,
} from "../__tools__/tool__repo";

export function GET() {
  logger.info({ route: "/api/v1/repositories" }, "Repository list requested");
  return NextResponse.json({
    repositories: listApprovedRepositories(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { fullName?: unknown };
  logger.info({ route: "/api/v1/repositories", body }, "Repository fetch requested");

  if (typeof body.fullName !== "string" || body.fullName.length === 0) {
    return NextResponse.json(
      {
        error: "fullName is required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchApprovedRepository({ fullName: body.fullName });
    logger.info(
      { route: "/api/v1/repositories", fullName: body.fullName },
      "Repository fetch completed",
    );
    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      { route: "/api/v1/repositories", body, error },
      "Repository fetch failed",
    );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch repo",
      },
      { status: 400 },
    );
  }
}

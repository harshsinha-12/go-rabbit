import { NextRequest, NextResponse } from "next/server";
import { fetchIssuesFromApprovedRepository } from "../__tools__/tool__issue";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    selectedRepositoryFullName?: unknown;
  };

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

    return NextResponse.json(result);
  } catch (error) {
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

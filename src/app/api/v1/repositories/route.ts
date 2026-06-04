import { NextRequest, NextResponse } from "next/server";
import {
  fetchApprovedRepository,
  listApprovedRepositories,
} from "../__tools__/tool__repo";

export function GET() {
  return NextResponse.json({
    repositories: listApprovedRepositories(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { fullName?: unknown };

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
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch repo",
      },
      { status: 400 },
    );
  }
}

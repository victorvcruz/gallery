import { NextRequest, NextResponse } from "next/server";
import { scanFolder, SortOrder, SortDirection } from "@/lib/fs-scanner";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const relativePath = pathSegments.join("/");
    const searchParams = request.nextUrl.searchParams;
    const sort = (searchParams.get("sort") || "captureDate") as SortOrder;
    const direction = (searchParams.get("dir") || "asc") as SortDirection;

    const result = await scanFolder(relativePath, sort, direction);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

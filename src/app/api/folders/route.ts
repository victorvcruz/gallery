import { NextRequest, NextResponse } from "next/server";
import { scanFolder, SortOrder, SortDirection } from "@/lib/fs-scanner";
import { cleanExpiredCache } from "@/lib/image-processor";

export const dynamic = "force-dynamic";

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    cleanExpiredCache().catch(() => {});
  }
}

export async function GET(request: NextRequest) {
  try {
    maybeCleanup();

    const searchParams = request.nextUrl.searchParams;
    const sort = (searchParams.get("sort") || "captureDate") as SortOrder;
    const direction = (searchParams.get("dir") || "asc") as SortDirection;

    // lite=true (default) returns placeholders for cache-miss photos and
    // enqueues background metadata work, so the client can start laying
    // out thumbs immediately on cold scans.
    const lite = searchParams.get("full") !== "1";
    const result = await scanFolder("", sort, direction, { lite });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

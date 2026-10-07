import { NextResponse } from "next/server";
import { getScanProgress } from "@/lib/fs-scanner";

export const dynamic = "force-dynamic";

/**
 * Lightweight polling endpoint for the client to track background
 * metadata processing. Returns the global queue state as of this instant:
 *   total   — items enqueued since the counters were last reset
 *   done    — items the worker has finished
 *   pending — items still waiting / currently running
 *
 * Counters reset to zero whenever the queue fully drains, so a fresh
 * cold scan always starts from clean numbers.
 */
export async function GET() {
  return NextResponse.json(getScanProgress(), {
    headers: { "Cache-Control": "no-store" },
  });
}

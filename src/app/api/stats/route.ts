import { NextResponse } from "next/server";
import { computeStats } from "@/lib/stats-aggregator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await computeStats("");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getPicks, setPick } from "@/lib/picks-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getPicks();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.path !== "string" || typeof body?.starred !== "boolean") {
      return NextResponse.json(
        { error: "Expected { path: string, starred: boolean }" },
        { status: 400 }
      );
    }
    if (body.path.includes("..") || body.path.startsWith("/")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    await setPick(body.path, body.starred);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

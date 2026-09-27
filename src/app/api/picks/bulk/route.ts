import { NextRequest, NextResponse } from "next/server";
import { setPicksBulk } from "@/lib/picks-store";

export const dynamic = "force-dynamic";

const MAX_BULK = 5000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.paths) || typeof body?.starred !== "boolean") {
      return NextResponse.json(
        { error: "Expected { paths: string[], starred: boolean }" },
        { status: 400 }
      );
    }
    if (body.paths.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Too many paths (max ${MAX_BULK})` },
        { status: 400 }
      );
    }
    for (const p of body.paths) {
      if (typeof p !== "string") {
        return NextResponse.json(
          { error: "paths must all be strings" },
          { status: 400 }
        );
      }
      if (p.includes("..") || p.startsWith("/")) {
        return NextResponse.json({ error: `Invalid path: ${p}` }, { status: 400 });
      }
    }
    await setPicksBulk(body.paths, body.starred);
    return NextResponse.json({ ok: true, count: body.paths.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

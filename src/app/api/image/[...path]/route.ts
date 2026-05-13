import { NextRequest, NextResponse } from "next/server";
import { getProcessedImage, ImageSize } from "@/lib/image-processor";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const relativePath = decodeURIComponent(pathSegments.join("/"));
    const searchParams = request.nextUrl.searchParams;
    const size = (searchParams.get("size") || "thumb") as ImageSize;

    if (!["thumb", "preview", "full"].includes(size)) {
      return NextResponse.json({ error: "Invalid size parameter" }, { status: 400 });
    }

    const { buffer, contentType } = await getProcessedImage(relativePath, size);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ENOENT") || message.includes("no such file")) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

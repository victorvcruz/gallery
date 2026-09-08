import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { getProcessedImage } from "@/lib/image-processor";
import {
  DownloadFormat,
  contentDispositionAttachment,
  downloadFileName,
  resolveSafeGalleryPath,
} from "@/lib/download-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const relativePath = decodeURIComponent(pathSegments.join("/"));
    const format = (request.nextUrl.searchParams.get("format") ||
      "original") as DownloadFormat;

    if (format !== "original" && format !== "jpeg") {
      return NextResponse.json(
        { error: "Invalid format" },
        { status: 400 }
      );
    }

    const absPath = resolveSafeGalleryPath(relativePath);
    if (!absPath) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const filename = downloadFileName(relativePath, format);
    const disposition = contentDispositionAttachment(filename);

    if (format === "jpeg") {
      // Use the full-resolution processed image (RAW → JPEG @ q95, JPEG → source).
      const { buffer, contentType } = await getProcessedImage(
        relativePath,
        "full"
      );
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(buffer.length),
          "Content-Disposition": disposition,
          "Cache-Control": "private, no-store",
        },
      });
    }

    // Stream the source file bytes without loading it all into memory.
    const stat = await fs.promises.stat(absPath);
    const nodeStream = fs.createReadStream(absPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stat.size),
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ENOENT") || message.includes("no such file")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

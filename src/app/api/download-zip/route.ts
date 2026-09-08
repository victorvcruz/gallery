import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { getProcessedImage } from "@/lib/image-processor";
import {
  DownloadFormat,
  contentDispositionAttachment,
  downloadFileName,
  resolveSafeGalleryPath,
} from "@/lib/download-helpers";

export const dynamic = "force-dynamic";

// Cap the number of entries per zip to keep memory / URL bounded.
const MAX_ENTRIES = 500;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const format = (sp.get("format") || "original") as DownloadFormat;
    if (format !== "original" && format !== "jpeg") {
      return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }

    const pathsRaw = sp.get("paths");
    if (!pathsRaw) {
      return NextResponse.json(
        { error: "Missing paths" },
        { status: 400 }
      );
    }

    let paths: string[];
    try {
      paths = JSON.parse(pathsRaw);
    } catch {
      return NextResponse.json(
        { error: "paths must be a JSON array" },
        { status: 400 }
      );
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ error: "No paths" }, { status: 400 });
    }
    if (paths.length > MAX_ENTRIES) {
      return NextResponse.json(
        { error: `Too many entries (max ${MAX_ENTRIES})` },
        { status: 400 }
      );
    }

    // Validate paths up-front so we can reject the request cleanly instead
    // of failing mid-stream after the download prompt has already shown up.
    const resolved: { rel: string; abs: string }[] = [];
    for (const rel of paths) {
      if (typeof rel !== "string") {
        return NextResponse.json(
          { error: "paths must be strings" },
          { status: 400 }
        );
      }
      const abs = resolveSafeGalleryPath(rel);
      if (!abs) {
        return NextResponse.json(
          { error: `Invalid path: ${rel}` },
          { status: 400 }
        );
      }
      resolved.push({ rel, abs });
    }

    const zipName = sp.get("filename") || "gallery.zip";

    // "store" (no compression) — JPEG/DNG are already compressed, so
    // recompressing burns CPU with essentially no size win.
    const archive = new ZipArchive({ store: true });
    archive.on("warning", (err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") console.error("zip warning:", err);
    });
    archive.on("error", (err: Error) => console.error("zip error:", err));

    // Kick off the pipeline asynchronously so archiver can start draining
    // as soon as the Response body is consumed.
    (async () => {
      try {
        // Track filename collisions across folders (basename is what the user
        // sees inside the zip; append " (n)" on collision).
        const usedNames = new Set<string>();
        const uniqueName = (name: string): string => {
          if (!usedNames.has(name)) {
            usedNames.add(name);
            return name;
          }
          const dot = name.lastIndexOf(".");
          const stem = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          for (let i = 2; i < 10000; i++) {
            const candidate = `${stem} (${i})${ext}`;
            if (!usedNames.has(candidate)) {
              usedNames.add(candidate);
              return candidate;
            }
          }
          return name;
        };

        for (const { rel, abs } of resolved) {
          const name = uniqueName(downloadFileName(rel, format));
          if (format === "jpeg") {
            const { buffer } = await getProcessedImage(rel, "full");
            archive.append(buffer, { name });
          } else {
            archive.file(abs, { name });
          }
        }
        await archive.finalize();
      } catch (err) {
        console.error("zip build error:", err);
        archive.abort();
      }
    })();

    const webStream = Readable.toWeb(archive) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDispositionAttachment(zipName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

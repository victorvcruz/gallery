import path from "path";
import { getPicks } from "@/lib/picks-store";

export const dynamic = "force-dynamic";

/**
 * CSV export of every starred photo, sorted by path. Rows:
 *   path,name,starred_at
 * where `path` is relative to GALLERY_ROOT (matches what /api/folders returns)
 * and `starred_at` is ISO 8601. Consumers can prepend their own base path
 * (e.g. `/Volumes/Torugo-SSD/final-projects/`) to walk the actual files.
 */

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  try {
    const snapshot = await getPicks();
    const rows = ["path,name,starred_at"];
    const entries = Object.entries(snapshot.starredAt).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    for (const [relPath, ts] of entries) {
      rows.push(
        [csvEscape(relPath), csvEscape(path.basename(relPath)), new Date(ts).toISOString()].join(",")
      );
    }
    const csv = rows.join("\n") + "\n";

    const filename = `picks-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(csv, "utf-8")),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

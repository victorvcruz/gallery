import {
  GroupBy,
  ImageGroup,
  ImageInfo,
  SortDirection,
} from "./types";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMonthName(d: Date): string {
  return capitalizeFirst(
    new Intl.DateTimeFormat(undefined, { month: "long" }).format(d)
  );
}

function keyAndLabel(d: Date, groupBy: Exclude<GroupBy, "none">): {
  key: string;
  label: string;
} {
  const y = d.getFullYear();
  switch (groupBy) {
    case "day":
      return {
        key: `${y}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        label: `${pad2(d.getDate())} ${formatMonthName(d)} ${y}`,
      };
    case "month":
      return {
        key: `${y}-${pad2(d.getMonth() + 1)}`,
        label: `${formatMonthName(d)} ${y}`,
      };
    case "year":
      return { key: String(y), label: String(y) };
  }
}

const UNDATED_KEY = "__undated__";

export function groupImages(
  images: ImageInfo[] | undefined | null,
  groupBy: GroupBy,
  direction: SortDirection
): ImageGroup[] {
  const list = Array.isArray(images) ? images : [];
  if (groupBy === "none" || list.length === 0) {
    return [{ key: "all", label: "", images: list }];
  }

  const buckets = new Map<string, ImageGroup>();

  for (const img of list) {
    const dateStr = img.captureDate || img.createdDate;
    let bucketKey = UNDATED_KEY;
    let bucketLabel = "Sem data";

    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const kl = keyAndLabel(d, groupBy);
        bucketKey = kl.key;
        bucketLabel = kl.label;
      }
    }

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { key: bucketKey, label: bucketLabel, images: [] };
      buckets.set(bucketKey, bucket);
    }
    bucket.images.push(img);
  }

  const ordered = [...buckets.values()].sort((a, b) => {
    // Push undated to the end regardless of direction.
    if (a.key === UNDATED_KEY) return 1;
    if (b.key === UNDATED_KEY) return -1;
    return a.key.localeCompare(b.key);
  });

  if (direction === "desc") {
    const undated = ordered.filter((g) => g.key === UNDATED_KEY);
    const dated = ordered.filter((g) => g.key !== UNDATED_KEY).reverse();
    return [...dated, ...undated];
  }

  return ordered;
}

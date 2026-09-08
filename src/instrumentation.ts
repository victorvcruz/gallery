export async function onRequestError() {
  // required export, no-op
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const fs = await import("fs");
    const path = await import("path");

    const getRoot = () => {
      const root = process.env.GALLERY_ROOT;
      if (!root) return null;
      return path.resolve(root);
    };

    const shutdown = () => {
      try {
        const root = getRoot();
        if (root) {
          const cacheDir = path.join(root, ".gallery-cache");
          // Wipe on-disk image caches but keep persisted metadata across restarts.
          for (const sub of ["thumb", "preview", "full"]) {
            fs.rmSync(path.join(cacheDir, sub), { recursive: true, force: true });
          }
        }
      } catch {
        // best-effort
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

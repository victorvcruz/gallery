# Gallery

A photography portfolio web app that reads directly from your filesystem. Point it at any folder structure and it becomes a navigable gallery with justified image grids, full-resolution zoom, and EXIF metadata display.

Built for high-resolution images from professional cameras (Sony Alpha, Canon, Nikon, Fuji, etc.) — handles RAW-edited exports at maximum quality without compromising browser performance.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development (pass your photos directory)
GALLERY_ROOT=/path/to/your/photos npm run dev

# Or set it in .env.local
echo "GALLERY_ROOT=/path/to/your/photos" > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

The application is completely agnostic to your folder structure. It reads from the root directory defined by `GALLERY_ROOT` and recursively navigates whatever folders and images it finds.

### Folder Navigation

- Each subdirectory becomes an **album** displayed as a card with a banner image
- The banner is the **first image found alphabetically** in that folder (or its subfolders)
- Nested folders are fully supported — navigate as deep as your structure goes
- The breadcrumb in the header allows navigating back to any parent level

### Example Structure

```
/photos/
├── Ubatuba/
│   ├── Dia 1/
│   │   ├── DSC06687.jpg
│   │   ├── DSC06690.jpg
│   │   └── ...
│   ├── Dia 2/
│   └── Dia 3/
├── Florianopolis/
│   ├── praia.jpg
│   └── centro/
│       └── IMG_001.jpg
└── Retratos/
    └── session_01.jpg
```

You never need to configure anything in the app itself — just organize your files in Finder/Explorer and refresh the browser.

## Features

### Justified Grid (Lightroom-style)

Images are displayed in a justified grid that adapts to each image's native aspect ratio. No cropping, no fixed cells — each row fills the container width while maintaining correct proportions.

### Image Viewer

Click any image to open a fullscreen viewer with:

- **Keyboard navigation**: Left/Right arrows to move between images, Escape to close
- **Click navigation**: Click the left/right edges of the screen
- **Swipe navigation**: Swipe on touch devices
- **Zoom**: Scroll wheel or trackpad pinch, centered on cursor position
- **Double-click**: Toggle between fit-to-screen and 2.5x zoom
- **Pan**: When zoomed in, drag to move around the image
- **EXIF bar**: Aperture, shutter speed, ISO, focal length, and capture date displayed at the bottom

### Sort Order

Images can be sorted by:

- **Capture Date** — from EXIF metadata (default)
- **Created Date** — file creation date on disk
- **File Name** — alphabetical order

Click the same sort option again to toggle ascending/descending.

### Progressive Loading

To handle large images (30–60MB each) without blocking the UI:

1. **Grid**: A shimmer placeholder appears → thumbnail (800px) loads via IntersectionObserver
2. **Modal**: Thumbnail is visible immediately → preview (2400px) loads in background
3. **Zoom**: Preview is visible → full resolution loads on first zoom interaction

Images that scroll out of view are **unloaded from memory** to prevent RAM exhaustion on galleries with hundreds of photos.

## Image Processing & Cache

### Thumbnail Generation

Thumbnails are generated **on-the-fly** the first time an image is requested, then cached to disk:

| Tier | Max dimension | Quality | Use case |
|------|--------------|---------|----------|
| `thumb` | 800px | 80% JPEG | Grid view |
| `preview` | 2400px | 85% JPEG | Modal view |
| `full` | Original | Original | Zoom |

All resized images use `mozjpeg` encoding for optimal quality/size ratio and include automatic EXIF orientation correction.

### Cache Location

```
<GALLERY_ROOT>/.gallery-cache/
├── thumb/      # 800px thumbnails
└── preview/    # 2400px previews
```

The cache lives inside your photos directory. Add `.gallery-cache` to your backup exclusion list if desired.

### Cache Invalidation

- **TTL**: Cached files expire after **1 day** and are automatically cleaned up
- **Source change detection**: If the original file is modified (newer mtime), the cached version is regenerated
- **Refresh sync**: Every page load reads the filesystem fresh — added/removed files appear on browser refresh
- **In-memory metadata**: Image dimensions and EXIF data are cached in memory for 1 hour, then re-read from disk

### Manual Cache Clear

Delete the cache directory at any time:

```bash
rm -rf /path/to/your/photos/.gallery-cache
```

Thumbnails will be regenerated on next access.

## Supported File Formats

### Fully Supported (displayed + thumbnails generated)

| Extension | Format |
|-----------|--------|
| `.jpg`, `.jpeg` | JPEG |
| `.png` | PNG |
| `.webp` | WebP |
| `.avif` | AVIF |
| `.tiff`, `.tif` | TIFF |
| `.heic`, `.heif` | HEIC/HEIF (Apple) |

### RAW Formats (thumbnail generation supported via libvips/sharp)

| Extension | Camera |
|-----------|--------|
| `.arw` | Sony |
| `.cr2`, `.cr3` | Canon |
| `.nef` | Nikon |
| `.dng` | Adobe DNG / Leica / others |
| `.raf` | Fujifilm |
| `.orf` | Olympus |
| `.rw2` | Panasonic |

> Note: RAW support depends on your system's libvips build. Most common RAW formats work out of the box with sharp on macOS and Linux.

### Ignored Files

- Files starting with `.` (hidden files, macOS resource forks like `._DSC001.jpg`)
- Directories starting with `.` (`.gallery-cache`, `.DS_Store`, etc.)
- Non-image files (videos, documents, etc.) are silently skipped

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `GALLERY_ROOT` | Yes | Absolute path to your photos root directory |
| `GALLERY_CACHE_DIR` | No | Override the on-disk cache location. Defaults to `<GALLERY_ROOT>/.gallery-cache`. Set this when the photos root is mounted read-only (e.g. Docker with `:ro`). |
| `GALLERY_CACHE_MAX_MB` | No | Maximum combined size (in megabytes) of the on-disk image caches (`thumb/`, `preview/`, `full/`). Defaults to `520`. When exceeded, least-recently-accessed entries are evicted down to ~90% of the cap. `metadata/` is not counted. |

Set it in `.env.local` for persistent configuration:

```
GALLERY_ROOT=/Volumes/Photos/Lightroom Exports
```

## Production Deployment

### Docker (recommended for home server)

```bash
# Edit docker-compose.yml and set the path to your photos
# Then:
docker compose up -d
```

In `docker-compose.yml`, change the volume mount to your photos directory:

```yaml
volumes:
  - /mnt/photos:/photos:ro   # <-- your photos path here
```

The `:ro` flag mounts read-only (the app never writes to your photos directory).

Build and run manually without compose:

```bash
docker build -t gallery .
docker run -d \
  -p 3000:3000 \
  -v /path/to/your/photos:/photos:ro \
  -v gallery-cache:/cache \
  -e GALLERY_ROOT=/photos \
  -e GALLERY_CACHE_DIR=/cache \
  --name gallery \
  --restart unless-stopped \
  gallery
```

The `/cache` volume is essential when `/photos` is mounted read-only —
without it, thumbnail generation fails with `EROFS` because the app can't
write to the photos tree.

### Without Docker

```bash
# Build for production
npm run build

# Start production server
GALLERY_ROOT=/path/to/photos npm start
```

The production server runs on port 3000 by default and listens on all network interfaces (`0.0.0.0`), accessible from any device on the same network.

### Network Access

The app binds to `0.0.0.0` by default, so any device on the same local network can access it at:

```
http://<server-ip>:3000
```

Use a reverse proxy (nginx, Caddy) for HTTPS and custom domains.

## Tech Stack

- **Next.js 16** — App Router, API routes, React Server Components
- **TypeScript** — Full type safety
- **Tailwind CSS 4** — Styling
- **sharp** — Image processing (resize, format conversion, EXIF reading)
- **exif-reader** — EXIF metadata parsing (aperture, shutter, ISO, lens, etc.)
- **justified-layout** — Flickr's justified grid algorithm

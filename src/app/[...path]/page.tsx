import FolderView from "@/components/FolderView";
import { isImageFile } from "@/lib/gallery-config";

interface PageProps {
  params: Promise<{ path: string[] }>;
}

export default async function FolderPage({ params }: PageProps) {
  const { path } = await params;
  const segments = path.map(decodeURIComponent);
  const last = segments[segments.length - 1] ?? "";

  // A URL like /Ubatuba/DSC06687.dng means: open the Ubatuba grid and
  // launch the viewer on DSC06687.dng. Reload / share / back all work
  // because the URL alone is enough to describe the whole UI state.
  if (segments.length > 0 && isImageFile(last)) {
    const folderPath = segments.slice(0, -1).join("/");
    return <FolderView path={folderPath} initialImage={last} />;
  }

  return <FolderView path={segments.join("/")} />;
}

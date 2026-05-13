import FolderView from "@/components/FolderView";

interface PageProps {
  params: Promise<{ path: string[] }>;
}

export default async function FolderPage({ params }: PageProps) {
  const { path } = await params;
  const folderPath = path.join("/");
  return <FolderView path={folderPath} />;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photography Portfolio",
  icons: { icon: [] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photography Portfolio",
  // When added to the iOS home screen the app runs standalone (no browser
  // chrome), with a dark status bar that blends into the near-black UI.
  appleWebApp: {
    capable: true,
    title: "Gallery",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
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

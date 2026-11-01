import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./cosmos-theme.css";

export const metadata: Metadata = {
  title: { default: "COSMOS", template: "%s | COSMOS" },
  description: "COSMOS, a private local intelligence workspace with persistent memory.",
};

export const viewport: Viewport = {
  themeColor: "#172521",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

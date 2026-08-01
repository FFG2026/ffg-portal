import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Future FG — Asset Finance for Business",
  description:
    "Hire purchase, finance lease and loan agreements for vehicles, plant and equipment, arranged by Future F G Limited, Rochester, Kent.",
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

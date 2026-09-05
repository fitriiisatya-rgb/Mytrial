import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amor Partnership Finance",
  description: "Sistem keuangan kemitraan multi-outlet — Amor Group",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

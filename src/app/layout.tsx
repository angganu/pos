import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "KASAKU — Sistem Kasir Multi-Toko",
  description: "Point of Sale multi-toko dengan harga per toko dan harga khusus member.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Downloaded at build time and served from this app: no request to Google at runtime.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}

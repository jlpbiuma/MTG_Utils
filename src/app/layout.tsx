import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MTG Utils | Gestor de Mazos y Colección de Cartas Magic",
  description:
    "Aplicación fullstack para gestionar mazos de Magic: The Gathering, inventario de colección física y cálculo automático de completitud de mazos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} dark antialiased`}
    >
      <body className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
          <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p>MTG Utils © 2026. Datos de cartas provistos por la API de Scryfall.</p>
            <p className="text-slate-600">
              Magic: The Gathering es marca registrada de Wizards of the Coast.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

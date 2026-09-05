import Link from "next/link";
import { Sparkles, Layers, Library, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/actions/auth";

export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/75 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/decks" className="flex items-center gap-2 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-amber-300 via-amber-200 to-white bg-clip-text text-transparent">
                MTG Utils
              </span>
              <span className="text-[10px] block font-mono text-amber-500/80 -mt-1 tracking-widest uppercase">
                Deck & Collection
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/decks"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
            >
              <Layers className="h-4 w-4 text-amber-400" />
              Mis Mazos
            </Link>
            <Link
              href="/collection"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
            >
              <Library className="h-4 w-4 text-sky-400" />
              Mi Colección
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-slate-800 bg-slate-900/60 text-xs text-slate-300">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline font-mono">{user.email}</span>
            <span className="sm:hidden font-mono">{user.name}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

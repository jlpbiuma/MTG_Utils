"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application Error caught by error boundary:", error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
      <div className="p-8 rounded-2xl border border-rose-500/20 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-6 shadow-lg shadow-rose-500/10">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Algo no ha salido como esperábamos
        </h1>

        <p className="mt-3 text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
          No se han podido cargar los datos de la aplicación. Esto suele ocurrir si la base de datos está iniciando, faltan variables de entorno en el despliegue o la sesión ha expirado.
        </p>

        {error?.digest && (
          <div className="mt-4 inline-block px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-[11px] font-mono text-slate-400">
            ID de diagnóstico: <span className="text-amber-400">{error.digest}</span>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => reset()}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>

          <Link href="/login">
            <Button variant="outline" className="border-slate-700 hover:bg-slate-800 gap-2">
              <LogIn className="h-4 w-4 text-amber-400" />
              Iniciar Sesión
            </Button>
          </Link>

          <Link href="/decks">
            <Button variant="ghost" className="text-slate-400 hover:text-white gap-2">
              <Home className="h-4 w-4" />
              Mis Mazos
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Library,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { importCollectionFromText } from "@/actions/import";

export function ImportCollectionDialog() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [collectionText, setCollectionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    totalImported: number;
    uniqueImported: number;
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCollectionText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionText.trim()) {
      setError("Por favor pega o carga una lista de cartas.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessResult(null);

    try {
      const res = await importCollectionFromText(collectionText);
      setSuccessResult(res);
      setCollectionText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al importar a la colección.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-slate-700 hover:border-sky-500/50 hover:bg-slate-900"
        >
          <UploadCloud className="h-4 w-4 text-sky-400" />
          Importar Lista (.txt)
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sky-300 text-xl">
            <Library className="h-5 w-5 text-sky-400" />
            Importar a mi Colección
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start gap-2 mt-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {successResult && (
          <div className="p-3.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-start gap-2 mt-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <strong>¡Importación completada!</strong> Se añadieron {successResult.totalImported} copias ({successResult.uniqueImported} cartas únicas) a tu inventario.
            </div>
          </div>
        )}

        <form onSubmit={handleImport} className="space-y-4 mt-2 flex-1 flex flex-col overflow-hidden">
          <div className="space-y-1.5 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Lista de Cartas en Formato Texto
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-slate-700 text-slate-300"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="h-3 w-3" />
                Cargar .txt
              </Button>
              <input
                type="file"
                accept=".txt"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <textarea
              placeholder={`Introduce una carta por línea con su cantidad:\n\n4 Lightning Bolt\n2 Sol Ring\n1 Atraxa, Praetors' Voice (2XM) 198\n1 Black Lotus`}
              value={collectionText}
              onChange={(e) => setCollectionText(e.target.value)}
              rows={8}
              className="flex-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 resize-none min-h-[180px]"
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cerrar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Resolviendo y guardando...
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4 mr-1.5" />
                  Añadir a mi Colección
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

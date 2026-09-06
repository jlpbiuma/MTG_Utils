"use client";

import React, { useState } from "react";
import { Plus, Layers, Loader2, Crown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDeck } from "@/actions/decks";

const MTG_FORMATS = [
  "Commander / EDH",
  "Modern",
  "Standard",
  "Pioneer",
  "Legacy",
  "Vintage",
  "Pauper",
  "Draft / Sealed",
  "Casual",
];

export function CreateDeckDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("Commander / EDH");
  const [commander, setCommander] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre del mazo es obligatorio");
      return;
    }

    if (format.includes("Commander") && !commander.trim()) {
      setError("El comandante es obligatorio para mazos de formato Commander.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createDeck({
        name: name.trim(),
        format,
        commander: commander.trim() || undefined,
        description: description.trim() || undefined,
      });
      setName("");
      setCommander("");
      setDescription("");
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el mazo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="mana" className="gap-2 shadow-lg shadow-amber-500/20">
          <Plus className="h-4 w-4" />
          Nuevo Mazo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <Layers className="h-5 w-5 text-amber-400" />
            Crear Nuevo Mazo
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Nombre del Mazo *
            </label>
            <Input
              placeholder="ej: Urza Lord High Artificer Combo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-950"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Formato
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {MTG_FORMATS.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              Comandante {format.includes("Commander") ? "*" : "(Opcional)"}
            </label>
            <Input
              placeholder="ej: Aragorn, the Uniter / Atraxa, Praetors' Voice"
              value={commander}
              onChange={(e) => setCommander(e.target.value)}
              className="bg-slate-950 border-slate-700 focus:border-amber-400"
              required={format.includes("Commander")}
            />
            <p className="text-[11px] text-slate-400">
              {format.includes("Commander")
                ? "Obligatorio para recomendaciones de EDHREC y análisis de comunidad."
                : "Opcional para formatos no-Commander."}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Descripción o Estrategia (Opcional)
            </label>
            <textarea
              placeholder="Notas sobre el mazo, combo principal o lista de deseos..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="flex w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:border-transparent resize-none"
            />
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="mana" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Crear Mazo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

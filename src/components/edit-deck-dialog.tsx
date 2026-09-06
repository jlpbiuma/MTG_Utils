"use client";

import React, { useState, useEffect } from "react";
import { Pencil, Layers, Loader2 } from "lucide-react";
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
import { updateDeck } from "@/actions/decks";

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

interface EditDeckDialogProps {
  deck: {
    id: string;
    name: string;
    format: string;
    description?: string | null;
  };
  onUpdated?: (updated: { name: string; format: string; description: string | null }) => void;
  trigger?: React.ReactNode;
}

export function EditDeckDialog({ deck, onUpdated, trigger }: EditDeckDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(deck.name);
  const [format, setFormat] = useState(deck.format || "Commander / EDH");
  const [description, setDescription] = useState(deck.description || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state if deck prop changes
  useEffect(() => {
    if (open) {
      setName(deck.name);
      setFormat(deck.format || "Commander / EDH");
      setDescription(deck.description || "");
      setError(null);
    }
  }, [open, deck]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre del mazo es obligatorio");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const trimmedDesc = description.trim() || null;

      await updateDeck(deck.id, {
        name: trimmedName,
        format,
        description: trimmedDesc || undefined,
      });

      onUpdated?.({
        name: trimmedName,
        format,
        description: trimmedDesc,
      });

      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al actualizar el mazo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 gap-1.5 text-xs text-slate-300 border-slate-700 hover:border-amber-400 hover:text-white"
            title="Editar nombre, formato o descripción del mazo"
          >
            <Pencil className="h-3.5 w-3.5 text-amber-400" />
            <span>Editar</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <Layers className="h-5 w-5 text-amber-400" />
            Editar Mazo
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
                <Pencil className="h-4 w-4 mr-1" />
              )}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, Loader2, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ManaCost } from "@/components/mana-cost";
import { searchCards, ScryfallCardResult } from "@/actions/scryfall";

interface CardSearchDialogProps {
  onAddCard: (card: {
    cardScryfallId: string;
    cardName: string;
    quantity: number;
    manaCost?: string | null;
    typeLine?: string | null;
    imageUri?: string | null;
    isSideboard?: boolean;
  }) => Promise<void>;
  title?: string;
  triggerText?: string;
  showSideboardOption?: boolean;
}

export function CardSearchDialog({
  onAddCard,
  title = "Buscar cartas en Scryfall",
  triggerText = "Añadir Carta",
  showSideboardOption = false,
}: CardSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryfallCardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isSideboard, setIsSideboard] = useState(false);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchCards(query, 1);
        setResults(res.data.slice(0, 15)); // First 15 cards
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleAdd = async (card: ScryfallCardResult) => {
    setAddingId(card.id);
    const imgUri =
      card.image_uris?.normal ||
      card.card_faces?.[0]?.image_uris?.normal ||
      null;

    try {
      await onAddCard({
        cardScryfallId: card.id,
        cardName: card.name,
        quantity,
        manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost || null,
        typeLine: card.type_line || card.card_faces?.[0]?.type_line || null,
        imageUri: imgUri,
        isSideboard,
      });
      // Don't close immediately so user can add more cards quickly
    } catch (err) {
      console.error(err);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="mana" className="gap-2">
          <Plus className="h-4 w-4" />
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2 text-amber-300">
            <Search className="h-5 w-5 text-amber-400" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Escribe el nombre de la carta (ej: Black Lotus, Lightning Bolt, Atraxa...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-11 bg-slate-950/90 text-base"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <span>Cantidad:</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 h-7 px-2 bg-slate-950 border border-slate-700 rounded text-center text-slate-100"
                />
              </label>

              {showSideboardOption && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSideboard}
                    onChange={(e) => setIsSideboard(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-400"
                  />
                  <span>Añadir al Sideboard</span>
                </label>
              )}
            </div>

            <span>{results.length > 0 ? `${results.length} resultados` : ""}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mt-3 pr-1 space-y-2 min-h-[300px] border-t border-slate-800 pt-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-2" />
              <p className="text-sm">Buscando en la base de datos de Scryfall...</p>
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <p>No se encontraron cartas para &quot;{query}&quot;</p>
              <p className="text-xs text-slate-500 mt-1">Prueba con el nombre en inglés o parte del nombre.</p>
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="text-center py-16 text-slate-500">
              <p>Escribe al menos 2 letras para buscar cartas oficiales de Magic.</p>
            </div>
          )}

          {!loading &&
            results.map((card) => {
              const imgUri =
                card.image_uris?.small ||
                card.card_faces?.[0]?.image_uris?.small ||
                null;
              const isAdding = addingId === card.id;

              return (
                <div
                  key={card.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {imgUri ? (
                      <img
                        src={imgUri}
                        alt={card.name}
                        className="w-10 h-14 object-cover rounded shadow-xs"
                      />
                    ) : (
                      <div className="w-10 h-14 bg-slate-800 rounded flex items-center justify-center text-slate-500">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-100 text-sm truncate">
                          {card.name}
                        </span>
                        <ManaCost
                          manaCost={card.mana_cost || card.card_faces?.[0]?.mana_cost}
                        />
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {card.type_line} • {card.set?.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isAdding}
                    onClick={() => handleAdd(card)}
                    className="shrink-0 hover:border-amber-500/50 hover:text-amber-300"
                  >
                    {isAdding ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir ({quantity})
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

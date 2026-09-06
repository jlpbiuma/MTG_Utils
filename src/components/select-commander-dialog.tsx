"use client";

import React, { useState, useMemo } from "react";
import { Crown, AlertCircle, Loader2, Sparkles, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CardPreviewHover } from "@/components/card-preview-hover";
import { DeckCardWithOwnership } from "@/lib/schemas";
import { setDeckCommander } from "@/actions/decks";

interface SelectCommanderDialogProps {
  deckId: string;
  deckName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckCards: DeckCardWithOwnership[];
  currentCommander?: string | null;
  onCommanderSelected: (commanderName: string, imageUri?: string) => void;
}

export function SelectCommanderDialog({
  deckId,
  deckName,
  open,
  onOpenChange,
  deckCards,
  currentCommander,
  onCommanderSelected,
}: SelectCommanderDialogProps) {
  const [commanderInput, setCommanderInput] = useState(currentCommander || "");
  const [candidateFilter, setCandidateFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Candidate creatures / legendaries in deck
  const candidateCards = useMemo(() => {
    return deckCards
      .filter((c) => {
        const type = (c.typeLine || "").toLowerCase();
        return type.includes("legendary") || type.includes("creature");
      })
      .sort((a, b) => {
        // Prioritize legendary creatures
        const aLeg = (a.typeLine || "").toLowerCase().includes("legendary");
        const bLeg = (b.typeLine || "").toLowerCase().includes("legendary");
        if (aLeg && !bLeg) return -1;
        if (!aLeg && bLeg) return 1;
        return a.cardName.localeCompare(b.cardName);
      });
  }, [deckCards]);

  const filteredCandidates = useMemo(() => {
    if (!candidateFilter.trim()) return candidateCards;
    const q = candidateFilter.toLowerCase().trim();
    return candidateCards.filter((c) => c.cardName.toLowerCase().includes(q));
  }, [candidateCards, candidateFilter]);

  const handleSelect = async (name: string, scryfallId?: string, imageUri?: string) => {
    if (!name.trim()) {
      setError("Por favor, ingresa el nombre de un comandante");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await setDeckCommander(deckId, name.trim(), scryfallId, imageUri);
      onCommanderSelected(name.trim(), res.commanderImageUri || imageUri);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar el comandante");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300 text-xl">
            <Crown className="h-6 w-6 text-amber-400" />
            Asignar Comandante al Mazo
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Cada mazo debe tener un comandante asignado para consultar recomendaciones comunitarias de EDHREC y estadísticas de legalidad.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Candidate list from current deck cards */}
          {candidateCards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Elegir de las cartas del mazo ({candidateCards.length})
                </label>
                {candidateCards.length > 6 && (
                  <div className="relative w-36">
                    <Search className="w-3 h-3 absolute left-2 top-2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filtrar..."
                      value={candidateFilter}
                      onChange={(e) => setCandidateFilter(e.target.value)}
                      className="w-full h-7 pl-6 pr-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200"
                    />
                  </div>
                )}
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {filteredCandidates.map((card) => {
                  const isLegendary = (card.typeLine || "").toLowerCase().includes("legendary");
                  const isCurrent = currentCommander === card.cardName;

                  return (
                    <div
                      key={card.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                        isCurrent
                          ? "bg-amber-500/10 border-amber-500/50"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CardPreviewHover cardName={card.cardName} imageUri={card.imageUri}>
                          {card.imageUri ? (
                            <img
                              src={card.imageUri}
                              alt={card.cardName}
                              className="w-8 h-11 object-cover rounded border border-slate-700 shrink-0 cursor-pointer"
                            />
                          ) : (
                            <div className="w-8 h-11 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] text-slate-500 shrink-0">
                              MTG
                            </div>
                          )}
                        </CardPreviewHover>

                        <div className="min-w-0">
                          <CardPreviewHover cardName={card.cardName} imageUri={card.imageUri}>
                            <span className="font-semibold text-xs text-slate-200 truncate cursor-pointer hover:text-amber-300 block">
                              {card.cardName}
                            </span>
                          </CardPreviewHover>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isLegendary && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-300 border-amber-500/30">
                                Legendaria
                              </Badge>
                            )}
                            <span className="text-[10px] text-slate-400 truncate">
                              {card.typeLine || "Criatura"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isCurrent ? "outline" : "mana"}
                        disabled={loading}
                        onClick={() =>
                          handleSelect(card.cardName, card.cardScryfallId, card.imageUri || undefined)
                        }
                        className="h-7 px-2.5 text-xs shrink-0"
                      >
                        {isCurrent ? "Actual" : "Elegir"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual Input */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              O escribe el nombre de cualquier comandante (en inglés):
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="ej: Niv-Mizzet, Parun / Aragorn, the Uniter"
                value={commanderInput}
                onChange={(e) => setCommanderInput(e.target.value)}
                className="bg-slate-950 border-slate-700 focus:border-amber-400 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSelect(commanderInput);
                  }
                }}
              />
              <Button
                variant="mana"
                disabled={loading || !commanderInput.trim()}
                onClick={() => handleSelect(commanderInput)}
                className="shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-xs text-slate-400 hover:text-white"
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

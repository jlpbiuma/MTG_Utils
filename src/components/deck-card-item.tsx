"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Trash2, ExternalLink, CheckCircle2, AlertCircle, Sparkles, Layers, Pencil, Crown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DeckWithCompletion } from "@/lib/schemas";
import { deleteDeck } from "@/actions/decks";
import { EditDeckDialog } from "@/components/edit-deck-dialog";

interface DeckCardItemProps {
  deck: DeckWithCompletion;
}

export function DeckCardItem({ deck }: DeckCardItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentName, setCurrentName] = useState(deck.name);
  const [currentFormat, setCurrentFormat] = useState(deck.format);
  const [currentDescription, setCurrentDescription] = useState(deck.description);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`¿Eliminar el mazo "${currentName}" permanentemente?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteDeck(deck.id);
    } catch (err) {
      console.error(err);
      setIsDeleting(false);
    }
  };

  const isComplete = deck.totalCards > 0 && deck.missingCardsCount === 0;

  return (
    <Card className="flex flex-col group hover:border-slate-700 transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/5 relative overflow-hidden">
      {/* Subtle top indicator based on completion */}
      <div
        className={`h-1 w-full transition-all duration-300 ${
          isComplete
            ? "bg-gradient-to-r from-emerald-500 to-teal-400"
            : deck.completionPercentage > 50
            ? "bg-gradient-to-r from-amber-500 to-yellow-400"
            : "bg-gradient-to-r from-slate-700 to-amber-600/50"
        }`}
      />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className="bg-slate-950/60 text-[11px] font-mono border-slate-700 text-amber-300">
            {currentFormat}
          </Badge>
          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
            <EditDeckDialog
              deck={{
                id: deck.id,
                name: currentName,
                format: currentFormat,
                description: currentDescription,
              }}
              onUpdated={(updated) => {
                setCurrentName(updated.name);
                setCurrentFormat(updated.format);
                setCurrentDescription(updated.description);
              }}
              trigger={
                <button
                  type="button"
                  title="Editar mazo"
                  className="text-slate-400 hover:text-amber-300 transition-colors p-1 rounded hover:bg-slate-800/60"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              }
            />
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              title="Eliminar mazo"
              className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded hover:bg-slate-800/60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <CardTitle className="text-lg group-hover:text-amber-300 transition-colors line-clamp-1 mt-1">
          {currentName}
        </CardTitle>

        {deck.commander ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-1 truncate">
            <Crown className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-slate-400 text-[11px]">Comandante:</span>
            <span className="font-semibold text-slate-200 truncate">{deck.commander}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mt-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Sin comandante asignado</span>
          </div>
        )}

        {currentDescription && (
          <p className="text-xs text-slate-400 line-clamp-2 mt-1 min-h-[32px]">
            {currentDescription}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 pb-4">
        <div className="space-y-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800/60">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Completitud del mazo</span>
            <span
              className={`font-bold font-mono text-sm ${
                isComplete
                  ? "text-emerald-400"
                  : deck.completionPercentage > 50
                  ? "text-amber-300"
                  : "text-slate-300"
              }`}
            >
              {deck.completionPercentage}%
            </span>
          </div>

          <Progress
            value={deck.completionPercentage}
            indicatorClassName={
              isComplete
                ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                : "bg-gradient-to-r from-amber-500 to-amber-300"
            }
          />

          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/40">
            <span className="text-slate-400">
              <strong className="text-slate-200 font-mono">{deck.ownedCards}</strong> /{" "}
              <span className="font-mono">{deck.totalCards}</span> cartas
            </span>

            {isComplete ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                ¡Completado!
              </span>
            ) : deck.missingCardsCount > 0 ? (
              <span className="flex items-center gap-1 text-amber-400/90 text-[11px]">
                <AlertCircle className="h-3.5 w-3.5" />
                Faltan {deck.missingCardsCount}
              </span>
            ) : (
              <span className="text-slate-500 text-[11px]">Sin cartas aún</span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        <Button asChild variant="outline" className="w-full justify-between group/btn hover:border-amber-500/50 hover:bg-slate-800/80">
          <Link href={`/decks/${deck.id}`}>
            <span className="group-hover/btn:text-amber-300">Ver Mazo y Faltantes</span>
            <ExternalLink className="h-4 w-4 text-slate-400 group-hover/btn:text-amber-300 transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

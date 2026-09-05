"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Trash2, ExternalLink, CheckCircle2, AlertCircle, Sparkles, Layers } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DeckWithCompletion } from "@/lib/schemas";
import { deleteDeck } from "@/actions/decks";

interface DeckCardItemProps {
  deck: DeckWithCompletion;
}

export function DeckCardItem({ deck }: DeckCardItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`¿Eliminar el mazo "${deck.name}" permanentemente?`)) {
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
            {deck.format}
          </Badge>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            title="Eliminar mazo"
            className="text-slate-500 hover:text-rose-400 transition-colors p-1 -mr-1 rounded hover:bg-slate-800/60 opacity-60 group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <CardTitle className="text-lg group-hover:text-amber-300 transition-colors line-clamp-1 mt-1">
          {deck.name}
        </CardTitle>

        {deck.description && (
          <p className="text-xs text-slate-400 line-clamp-2 mt-1 min-h-[32px]">
            {deck.description}
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

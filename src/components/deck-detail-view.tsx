"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Filter,
  BookmarkPlus,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ManaCost } from "@/components/mana-cost";
import { CardPreviewHover } from "@/components/card-preview-hover";
import { CardSearchDialog } from "@/components/card-search-dialog";
import { DeckDetailWithStats, DeckCardWithOwnership } from "@/lib/schemas";
import {
  addCardToDeck,
  updateDeckCardQuantity,
  removeCardFromDeck,
  assignCardToDeck,
  unassignCardFromDeck,
  reassignCardToDeck,
} from "@/actions/decks";
import { addOrIncrementCard } from "@/actions/collection";
import { PriceProvider, PriceSummary } from "@/lib/pricing";
import { PricingProviderSelector } from "@/components/pricing-provider-selector";
import { PriceBadge } from "@/components/price-badge";
import { CardSortingBar } from "@/components/card-sorting-bar";
import { SortField, SortDirection, sortCards } from "@/lib/sorting";
import { normalizeCardName } from "@/lib/card-utils";



interface DeckDetailViewProps {
  initialDeck: DeckDetailWithStats;
}

export function DeckDetailView({ initialDeck }: DeckDetailViewProps) {
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "owned">("all");
  const [activeBoard, setActiveBoard] = useState<"mainboard" | "sideboard">("mainboard");
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");


  // Dynamic pricing state
  const [priceProvider, setPriceProvider] = useState<PriceProvider>("cardmarket");
  const [priceSummary, setPriceSummary] = useState<PriceSummary | null>(null);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);

  const loadPrices = useCallback(
    async (providerToLoad = priceProvider, bypassCache = false) => {
      setIsLoadingPrices(true);
      try {
        const res = await fetch("/api/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckId: initialDeck.id,
            provider: providerToLoad,
            bypassCache,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.summary) {
            setPriceSummary(json.summary);
          }
        }
      } catch (err) {
        console.error("Failed to load deck prices:", err);
      } finally {
        setIsLoadingPrices(false);
      }
    },
    [initialDeck.id, priceProvider]
  );

  useEffect(() => {
    loadPrices(priceProvider, false);
  }, [priceProvider, loadPrices]);

  const mainboardCards = initialDeck.cards.filter((c) => !c.isSideboard);
  const sideboardCards = initialDeck.cards.filter((c) => c.isSideboard);

  const activeCards = activeBoard === "mainboard" ? mainboardCards : sideboardCards;

  const filteredCards = activeCards.filter((c) => {
    if (filterMode === "missing") return c.missingCount > 0;
    if (filterMode === "owned") return c.ownedInCollection >= c.quantity;
    return true;
  });

  const handleAddCard = async (cardData: {
    cardScryfallId: string;
    cardName: string;
    quantity: number;
    manaCost?: string | null;
    typeLine?: string | null;
    imageUri?: string | null;
    isSideboard?: boolean;
  }) => {
    await addCardToDeck(initialDeck.id, {
      cardScryfallId: cardData.cardScryfallId,
      cardName: cardData.cardName,
      quantity: cardData.quantity,
      isSideboard: cardData.isSideboard ?? (activeBoard === "sideboard"),
      manaCost: cardData.manaCost,
      typeLine: cardData.typeLine,
      imageUri: cardData.imageUri,
    });
  };

  const handleUpdateQuantity = async (cardId: string, currentQty: number, delta: number) => {
    setLoadingCardId(cardId);
    try {
      const newQty = currentQty + delta;
      await updateDeckCardQuantity(cardId, newQty);
    } finally {
      setLoadingCardId(null);
    }
  };

  const handleRemove = async (cardId: string) => {
    if (!confirm("¿Quitar esta carta del mazo?")) return;
    setLoadingCardId(cardId);
    try {
      await removeCardFromDeck(cardId);
    } finally {
      setLoadingCardId(null);
    }
  };

  const handleAssign = async (cardId: string) => {
    setLoadingCardId(cardId);
    try {
      await assignCardToDeck(cardId, 1);
    } catch (err: any) {
      alert(err?.message || "Error al asignar carta");
    } finally {
      setLoadingCardId(null);
    }
  };

  const handleUnassign = async (cardId: string) => {
    setLoadingCardId(cardId);
    try {
      await unassignCardFromDeck(cardId, 1);
    } catch (err: any) {
      alert(err?.message || "Error al liberar carta");
    } finally {
      setLoadingCardId(null);
    }
  };

  const handleReassign = async (fromDeckId: string, toDeckCardId: string, cardName: string) => {
    setLoadingCardId(toDeckCardId);
    try {
      await reassignCardToDeck(fromDeckId, toDeckCardId, cardName, 1);
    } catch (err: any) {
      alert(err?.message || "Error al reasignar carta");
    } finally {
      setLoadingCardId(null);
    }
  };

  const handleAddMissingToCollection = async (card: DeckCardWithOwnership) => {
    setLoadingCardId(card.id);
    try {
      await addOrIncrementCard({
        cardScryfallId: card.cardScryfallId,
        cardName: card.cardName,
        quantity: card.missingCount,
        manaCost: card.manaCost,
        typeLine: card.typeLine,
        imageUri: card.imageUri,
      });
    } finally {
      setLoadingCardId(null);
    }
  };

  const sortedCards = sortCards(filteredCards, sortField, sortDirection, priceSummary);

  const isComplete = initialDeck.totalCards > 0 && initialDeck.missingCardsCount === 0;


  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Top back navigation */}
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-2 text-slate-400 hover:text-white -ml-2">
          <Link href="/decks">
            <ArrowLeft className="h-4 w-4" />
            Volver a la lista de mazos
          </Link>
        </Button>
      </div>

      {/* Deck Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-md shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/30 font-mono">
                {initialDeck.format}
              </Badge>
              {isComplete && (
                <Badge variant="success" className="gap-1 font-semibold">
                  <CheckCircle2 className="h-3 w-3" />
                  Mazo Completo
                </Badge>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              {initialDeck.name}
            </h1>

            {initialDeck.description && (
              <p className="text-sm text-slate-400 max-w-2xl">{initialDeck.description}</p>
            )}
          </div>

          {/* Quick completion badge widget */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 min-w-[240px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Estado de Colección
              </span>
              <span
                className={`font-mono font-black text-lg ${
                  isComplete
                    ? "text-emerald-400"
                    : initialDeck.completionPercentage > 50
                    ? "text-amber-300"
                    : "text-slate-300"
                }`}
              >
                {initialDeck.completionPercentage}%
              </span>
            </div>

            <Progress
              value={initialDeck.completionPercentage}
              indicatorClassName={
                isComplete
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                  : "bg-gradient-to-r from-amber-500 to-amber-300"
              }
            />

            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span>
                <strong className="text-slate-200">{initialDeck.ownedCards}</strong> /{" "}
                {initialDeck.totalCards} cartas
              </span>
              {initialDeck.missingCardsCount > 0 ? (
                <span className="text-amber-400/90 font-medium">
                  Faltan {initialDeck.missingCardsCount} cartas
                </span>
              ) : (
                <span className="text-emerald-400 font-medium">100% en mano</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Pricing Selector & Net Totals */}
      <PricingProviderSelector
        currentProvider={priceProvider}
        onProviderChange={(p) => setPriceProvider(p)}
        onRefreshPrices={() => loadPrices(priceProvider, true)}
        summary={priceSummary}
        isLoading={isLoadingPrices}
        showMissingNetValue={true}
      />

      {/* Action Toolbar & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        {/* Mainboard vs Sideboard Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveBoard("mainboard")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeBoard === "mainboard"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            Mainboard ({mainboardCards.reduce((s, c) => s + c.quantity, 0)})
          </button>
          <button
            onClick={() => setActiveBoard("sideboard")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeBoard === "sideboard"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            Sideboard ({sideboardCards.reduce((s, c) => s + c.quantity, 0)})
          </button>
        </div>

        {/* Filters and Add Card */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === "all"
                  ? "bg-slate-800 text-white font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterMode("missing")}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === "missing"
                  ? "bg-amber-500/20 text-amber-300 font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Solo Faltantes
            </button>
            <button
              onClick={() => setFilterMode("owned")}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === "owned"
                  ? "bg-emerald-500/20 text-emerald-300 font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              En Colección
            </button>
          </div>

          <CardSearchDialog
            onAddCard={handleAddCard}
            title={`Añadir Carta a ${activeBoard === "mainboard" ? "Mainboard" : "Sideboard"}`}
            triggerText="Buscar en Scryfall"
            showSideboardOption={true}
          />
        </div>
      </div>

      {/* Interactive Sorting Bar */}
      {filteredCards.length > 0 && (
        <div className="px-1">
          <CardSortingBar
            currentField={sortField}
            currentDirection={sortDirection}
            onSortChange={(f, d) => {
              setSortField(f);
              setSortDirection(d);
            }}
            showStatusOption={true}
          />
        </div>
      )}

      {/* Card Table / List */}
      {filteredCards.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/20">
          <p className="text-slate-400">
            {filterMode === "missing"
              ? "¡Excelente! No tienes cartas faltantes bajo este filtro."
              : "No hay cartas en esta sección aún."}
          </p>
          <div className="mt-4">
            <CardSearchDialog
              onAddCard={handleAddCard}
              title={`Añadir Carta a ${activeBoard}`}
              triggerText="Añadir primera carta"
            />
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md shadow-xl">
          <div className="divide-y divide-slate-800/60">
            {sortedCards.map((card) => {
              const isCardComplete = card.ownedInCollection >= card.quantity;
              const isBusy = loadingCardId === card.id;

              return (
                <div
                  key={card.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 transition-colors hover:bg-slate-800/30 ${
                    !isCardComplete ? "border-l-4 border-l-amber-500/80" : "border-l-4 border-l-emerald-500/80"
                  }`}
                >
                  {/* Left: Card art hover + Name + Types + Mana Cost */}
                  <div className="flex items-center gap-3 min-w-0">
                    <CardPreviewHover
                      cardName={card.cardName}
                      imageUri={card.imageUri}
                      className="shrink-0"
                    >
                      {card.imageUri ? (
                        <img
                          src={card.imageUri}
                          alt={card.cardName}
                          className="w-11 h-16 object-cover rounded-md border border-slate-700 hover:border-amber-400 transition-colors shadow-sm"
                        />
                      ) : (
                        <div className="w-11 h-16 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-500">
                          MTG
                        </div>
                      )}
                    </CardPreviewHover>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardPreviewHover
                          cardName={card.cardName}
                          imageUri={card.imageUri}
                        >
                          <span className="font-bold text-slate-100 hover:text-amber-300 transition-colors cursor-pointer text-base">
                            {card.cardName}
                          </span>
                        </CardPreviewHover>

                        <ManaCost manaCost={card.manaCost} />
                      </div>

                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {card.typeLine || "Card"}
                      </p>

                      {/* Collection status pill */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {isCardComplete ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                            <CheckCircle2 className="h-3 w-3" />
                            Tienes {card.ownedInCollection} de {card.quantity}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                            <AlertCircle className="h-3 w-3" />
                            Faltan {card.missingCount} copias (tienes {card.ownedInCollection}/{card.quantity})
                          </span>
                        )}

                        {!isCardComplete && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddMissingToCollection(card)}
                            disabled={isBusy}
                            className="h-6 text-[11px] px-2 gap-1 text-amber-300 border-amber-500/40 hover:bg-amber-500/10 hover:border-amber-400"
                            title="Añadir automáticamente las copias faltantes a tu colección física"
                          >
                            <BookmarkPlus className="h-3 w-3" />
                            Tengo las faltantes
                          </Button>
                        )}
                      </div>

                      {/* Physical Assignment status pill & actions */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {card.assignedQuantity > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 bg-sky-950/70 px-2 py-0.5 rounded border border-sky-800/60 shadow-sm"
                              title="Copias de tu colección física asignadas a este mazo"
                            >
                              🎯 Asignada ({card.assignedQuantity}/{card.quantity})
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUnassign(card.id)}
                              disabled={isBusy}
                              className="h-6 text-[11px] px-2 text-slate-400 hover:text-rose-300 hover:bg-rose-950/30"
                              title="Liberar 1 copia física de vuelta a tu colección libre"
                            >
                              Liberar
                            </Button>
                          </div>
                        )}

                        {card.assignedQuantity < card.quantity && (
                          <>
                            {card.availableToAssign > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAssign(card.id)}
                                disabled={isBusy}
                                className="h-6 text-[11px] px-2 gap-1 text-sky-300 border-sky-500/40 hover:bg-sky-500/10 hover:border-sky-400"
                                title="Asignar una copia física disponible de tu colección a este mazo"
                              >
                                📥 Asignar al mazo ({card.availableToAssign} disp.)
                              </Button>
                            ) : card.assignedInOtherDecks && card.assignedInOtherDecks.length > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap text-xs text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded border border-amber-800/60">
                                <span className="font-semibold text-amber-400">⚠️ Asignada en:</span>
                                {card.assignedInOtherDecks.map((other) => (
                                  <span
                                    key={other.deckId}
                                    className="flex items-center gap-1 bg-amber-900/40 px-1.5 py-0.5 rounded border border-amber-700/40 text-amber-200 font-medium"
                                  >
                                    <span>
                                      {other.deckName} ({other.quantity})
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        handleReassign(other.deckId, card.id, card.cardName)
                                      }
                                      disabled={isBusy}
                                      className="h-4 text-[10px] px-1 text-amber-300 hover:text-white underline font-bold"
                                      title={`Reasignar copia física desde ${other.deckName} a este mazo`}
                                    >
                                      Reasignar aquí
                                    </Button>
                                  </span>
                                ))}
                              </div>
                            ) : card.ownedInCollection === 0 ? (
                              <span className="text-xs text-slate-500 italic">
                                (No la tienes en colección)
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>


                  {/* Right: Price Badge + Quantity controls & Delete */}
                  <div className="flex items-center justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60 flex-wrap sm:flex-nowrap">
                    <PriceBadge
                      quote={
                        priceSummary?.quotes[card.cardScryfallId] ||
                        priceSummary?.quotes[normalizeCardName(card.cardName)]
                      }
                      showSubtotal={true}
                    />

                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-white"
                        disabled={isBusy}
                        onClick={() => handleUpdateQuantity(card.id, card.quantity, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>

                      <span className="font-mono font-bold text-sm min-w-[20px] text-center text-slate-200">
                        {card.quantity}
                      </span>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-white"
                        disabled={isBusy}
                        onClick={() => handleUpdateQuantity(card.id, card.quantity, 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30"
                      disabled={isBusy}
                      onClick={() => handleRemove(card.id)}
                      title="Eliminar carta del mazo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

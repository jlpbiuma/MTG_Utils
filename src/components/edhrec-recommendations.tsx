"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import {
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  Loader2,
  Crown,
  ExternalLink,
  Flame,
  ArrowUpDown,
  Filter,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CardPreviewHover } from "@/components/card-preview-hover";
import { EdhrecCardRecommendation, DeckCardWithOwnership } from "@/lib/schemas";
import {
  getDeckRecommendations,
  DeckRecommendationsResult,
} from "@/actions/edhrec";
import { addCardToDeck, setDeckCommander } from "@/actions/decks";
import { normalizeCardName } from "@/lib/card-utils";
import { toEdhrecSlug } from "@/lib/edhrec";

interface EdhrecRecommendationsProps {
  deckId: string;
  commander: string | null;
  commanderImageUri?: string | null;
  deckCards: DeckCardWithOwnership[];
  onCardAdded?: (cardName: string) => void;
  onCommanderUpdated?: (commanderName: string, imageUri?: string) => void;
}

type StatusFilter = "all" | "in_collection" | "missing" | "in_deck";
type SortOption = "inclusion" | "synergy" | "name";

export function EdhrecRecommendations({
  deckId,
  commander: initialCommander,
  commanderImageUri: initialCommanderImageUri,
  deckCards,
  onCardAdded,
  onCommanderUpdated,
}: EdhrecRecommendationsProps) {
  const [commander, setCommander] = useState<string | null>(initialCommander);
  const [commanderImageUri, setCommanderImageUri] = useState<string | null>(
    initialCommanderImageUri || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<EdhrecCardRecommendation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [commanderStats, setCommanderStats] = useState<{
    numDecks?: number;
    colorIdentity?: string[];
  } | null>(null);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("inclusion");

  // Loading card states
  const [addingCardName, setAddingCardName] = useState<string | null>(null);
  const [addedCardsMap, setAddedCardsMap] = useState<Record<string, boolean>>({});

  // Manual Commander selection state (when deck has no commander)
  const [manualCommanderInput, setManualCommanderInput] = useState("");
  const [isSettingCommander, setIsSettingCommander] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load recommendations
  const loadRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: DeckRecommendationsResult = await getDeckRecommendations(deckId);
      if (res.error) {
        setError(res.error);
      }
      if (res.commander) {
        setCommander(res.commander.name);
        if (res.commander.imageUri) {
          setCommanderImageUri(res.commander.imageUri);
        }
        setCommanderStats({
          numDecks: res.commander.numDecks,
          colorIdentity: res.commander.colorIdentity,
        });
      }
      setCategories(res.categories || []);
      setRecommendations(res.recommendations || []);
    } catch (err) {
      console.error("Failed to load EDHREC recommendations:", err);
      setError("No se pudieron cargar las recomendaciones de EDHREC.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, [deckId, initialCommander]);

  // Set Commander action
  const handleAssignCommander = async (
    name: string,
    scryfallId?: string,
    imageUri?: string
  ) => {
    if (!name.trim()) return;
    setIsSettingCommander(true);
    try {
      await setDeckCommander(deckId, name.trim(), scryfallId, imageUri);
      setCommander(name.trim());
      if (imageUri) setCommanderImageUri(imageUri);
      onCommanderUpdated?.(name.trim(), imageUri);
      await loadRecommendations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al asignar comandante");
    } finally {
      setIsSettingCommander(false);
    }
  };

  // Add card to deck action
  const handleAddCard = async (card: EdhrecCardRecommendation) => {
    setAddingCardName(card.name);
    try {
      await addCardToDeck(deckId, {
        cardScryfallId: card.id,
        cardName: card.name,
        quantity: 1,
        isSideboard: false,
        imageUri: card.imageUri || undefined,
      });

      // Mark locally as added/in deck
      setAddedCardsMap((prev) => ({
        ...prev,
        [card.normalizedName]: true,
      }));

      // Update recommendations array state
      setRecommendations((prev) =>
        prev.map((r) =>
          r.normalizedName === card.normalizedName ? { ...r, isInDeck: true } : r
        )
      );

      onCardAdded?.(card.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al añadir la carta al mazo");
    } finally {
      setAddingCardName(null);
    }
  };

  // Filtered and Sorted Recommendations
  const filteredCards = useMemo(() => {
    return recommendations.filter((card) => {
      // 1. Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        if (
          !card.name.toLowerCase().includes(query) &&
          !card.category.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // 2. Category
      if (selectedCategory !== "all" && card.category !== selectedCategory) {
        return false;
      }

      // 3. Status filter
      const inDeck = card.isInDeck || addedCardsMap[card.normalizedName];
      if (statusFilter === "in_deck") {
        if (!inDeck) return false;
      } else if (statusFilter === "in_collection") {
        if (inDeck || !card.isInCollection) return false;
      } else if (statusFilter === "missing") {
        if (inDeck || card.isInCollection) return false;
      }

      return true;
    });
  }, [recommendations, searchQuery, selectedCategory, statusFilter, addedCardsMap]);

  const sortedCards = useMemo(() => {
    return [...filteredCards].sort((a, b) => {
      if (sortBy === "inclusion") {
        return b.inclusionPct - a.inclusionPct;
      }
      if (sortBy === "synergy") {
        return b.synergy - a.synergy;
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [filteredCards, sortBy]);

  // Counts for status filters
  const counts = useMemo(() => {
    let inDeck = 0;
    let inCollection = 0;
    let missing = 0;
    for (const card of recommendations) {
      const isCardInDeck = card.isInDeck || addedCardsMap[card.normalizedName];
      if (isCardInDeck) {
        inDeck++;
      } else if (card.isInCollection) {
        inCollection++;
      } else {
        missing++;
      }
    }
    return {
      total: recommendations.length,
      inDeck,
      inCollection,
      missing,
    };
  }, [recommendations, addedCardsMap]);

  // Candidate commanders from current deck (creatures or legendaries)
  const candidateCommanders = useMemo(() => {
    return deckCards.filter(
      (c) =>
        c.typeLine?.toLowerCase().includes("legendary") ||
        c.typeLine?.toLowerCase().includes("creature")
    );
  }, [deckCards]);

  // If no commander is assigned, display the mandatory commander prompt
  if (!commander && !loading) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-slate-900/80 p-8 text-center space-y-6 shadow-2xl backdrop-blur-md">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Crown className="w-8 h-8" />
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <h3 className="text-2xl font-bold text-white">
            Elige un Comandante para tu Mazo
          </h3>
          <p className="text-sm text-slate-400">
            Para consultar las recomendaciones oficiales de la comunidad de EDHREC, es imprescindible que el mazo cuente con un comandante asignado.
          </p>
        </div>

        {/* Existing candidate creatures in deck */}
        {candidateCommanders.length > 0 && (
          <div className="space-y-3 max-w-xl mx-auto pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 text-left">
              Cartas legendarias o criaturas en este mazo:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {candidateCommanders.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CardPreviewHover cardName={card.cardName} imageUri={card.imageUri}>
                      <span className="font-semibold text-sm text-slate-200 truncate cursor-pointer hover:text-amber-300">
                        {card.cardName}
                      </span>
                    </CardPreviewHover>
                  </div>
                  <Button
                    size="sm"
                    variant="mana"
                    className="shrink-0 text-xs h-7 gap-1"
                    disabled={isSettingCommander}
                    onClick={() =>
                      handleAssignCommander(
                        card.cardName,
                        card.cardScryfallId,
                        card.imageUri || undefined
                      )
                    }
                  >
                    <Crown className="w-3 h-3 text-amber-400" />
                    Elegir
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Commander input */}
        <div className="pt-4 border-t border-slate-800 max-w-md mx-auto space-y-3">
          <p className="text-xs text-slate-400">
            O escribe el nombre exacto de cualquier comandante (en inglés):
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="ej: Aragorn, the Uniter"
              value={manualCommanderInput}
              onChange={(e) => setManualCommanderInput(e.target.value)}
              className="bg-slate-950 border-slate-700"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAssignCommander(manualCommanderInput);
                }
              }}
            />
            <Button
              variant="mana"
              disabled={isSettingCommander || !manualCommanderInput.trim()}
              onClick={() => handleAssignCommander(manualCommanderInput)}
            >
              {isSettingCommander ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Guardar"
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Commander Banner & EDHREC Info Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Commander Card Art & Title */}
          <div className="flex items-center gap-4 min-w-0">
            {commander && (
              <CardPreviewHover cardName={commander} imageUri={commanderImageUri}>
                {commanderImageUri ? (
                  <img
                    src={commanderImageUri}
                    alt={commander}
                    className="w-16 h-22 sm:w-20 sm:h-28 object-cover rounded-lg border-2 border-amber-500/60 shadow-lg shrink-0 cursor-pointer hover:border-amber-400 transition-all hover:scale-105"
                  />
                ) : (
                  <div className="w-16 h-22 sm:w-20 sm:h-28 rounded-lg bg-slate-800 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Crown className="w-8 h-8" />
                  </div>
                )}
              </CardPreviewHover>
            )}

            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-300 border-amber-500/30 gap-1 text-xs"
                >
                  <Crown className="h-3 w-3 text-amber-400" />
                  Comandante
                </Badge>

                {commanderStats?.numDecks ? (
                  <Badge
                    variant="outline"
                    className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-xs"
                  >
                    {commanderStats.numDecks.toLocaleString()} mazos en EDHREC
                  </Badge>
                ) : null}
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">
                {commander}
              </h2>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>
                  Recomendaciones basadas en datos colectivos de la comunidad
                </span>
                {commander && (
                  <a
                    href={`https://edhrec.com/commanders/${toEdhrecSlug(commander)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 underline font-medium"
                  >
                    Ver en EDHREC
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats Summary */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-800">
            <div className="text-center px-3 py-2 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400">Sugerencias</div>
              <div className="text-lg font-mono font-bold text-white">
                {counts.total}
              </div>
            </div>

            <div className="text-center px-3 py-2 bg-emerald-950/30 rounded-xl border border-emerald-800/40">
              <div className="text-xs text-emerald-400">En Mazo</div>
              <div className="text-lg font-mono font-bold text-emerald-300">
                {counts.inDeck}
              </div>
            </div>

            <div className="text-center px-3 py-2 bg-amber-950/30 rounded-xl border border-amber-800/40">
              <div className="text-xs text-amber-300">En Colección</div>
              <div className="text-lg font-mono font-bold text-amber-400">
                {counts.inCollection}
              </div>
            </div>

            <div className="text-center px-3 py-2 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400">Faltantes</div>
              <div className="text-lg font-mono font-bold text-slate-300">
                {counts.missing}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters, Categories & Sorting */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Live Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar cartas recomendadas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-900 border-slate-800 text-sm focus:border-amber-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto text-xs">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                statusFilter === "all"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Todas ({counts.total})
            </button>

            <button
              onClick={() => setStatusFilter("in_collection")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                statusFilter === "in_collection"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                  : "text-amber-400/80 hover:text-amber-300"
              }`}
              title="Cartas recomendadas que posees en tu colección pero aún no están en el mazo"
            >
              <Sparkles className="h-3 w-3 text-amber-400" />
              En Colección ({counts.inCollection})
            </button>

            <button
              onClick={() => setStatusFilter("in_deck")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
                statusFilter === "in_deck"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-emerald-400/80 hover:text-emerald-300"
              }`}
            >
              <Check className="h-3 w-3" />
              En Mazo ({counts.inDeck})
            </button>

            <button
              onClick={() => setStatusFilter("missing")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                statusFilter === "missing"
                  ? "bg-slate-800 text-slate-200 border border-slate-700 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Faltantes ({counts.missing})
            </button>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Ordenar:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-medium focus:outline-none focus:border-amber-400"
            >
              <option value="inclusion">% Inclusión (EDHREC)</option>
              <option value="synergy">Mayor Sinergia (+)</option>
              <option value="name">Nombre (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === "all"
                  ? "bg-amber-500 text-slate-950"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              Todas las categorías
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-16 space-y-4 rounded-2xl bg-slate-900/40 border border-slate-800">
          <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
          <p className="text-sm text-slate-400 font-medium">
            Consultando recomendaciones de la comunidad en EDHREC...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-5 h-5 text-rose-400" />
            Aviso de EDHREC
          </div>
          <p className="text-sm text-rose-300/90">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={loadRecommendations}
            className="mt-2 text-xs border-rose-800 hover:bg-rose-900/50"
          >
            Reintentar
          </Button>
        </div>
      )}

      {/* Empty Filter Results */}
      {!loading && !error && sortedCards.length === 0 && (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
          <Sparkles className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-base font-semibold text-slate-300">
            No se encontraron cartas con los filtros seleccionados
          </p>
          <p className="text-xs text-slate-500">
            Prueba a limpiar la búsqueda o cambiar la categoría/estado.
          </p>
          {(searchQuery || selectedCategory !== "all" || statusFilter !== "all") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
                setStatusFilter("all");
              }}
              className="text-xs mt-2"
            >
              Restablecer filtros
            </Button>
          )}
        </div>
      )}

      {/* Recommendations Cards Grid */}
      {!loading && sortedCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedCards.map((card) => {
            const isCardInDeck = card.isInDeck || addedCardsMap[card.normalizedName];
            const isAdding = addingCardName === card.name;

            return (
              <div
                key={`${card.id}-${card.name}`}
                className={`relative flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 hover:shadow-xl ${
                  isCardInDeck
                    ? "bg-slate-900/40 border-slate-800 opacity-80 hover:opacity-100"
                    : card.isInCollection
                    ? "bg-gradient-to-b from-amber-950/20 to-slate-900 border-amber-500/40 shadow-amber-500/5 hover:border-amber-400"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div>
                  {/* Top line: Category + Inclusion Rate */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono uppercase tracking-wider bg-slate-950/60 border-slate-800 text-slate-400 truncate max-w-[150px]"
                    >
                      {card.category}
                    </Badge>

                    {/* Community Inclusion Badge */}
                    <div
                      className="flex items-center gap-1 font-mono font-bold text-xs px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-amber-300 shrink-0"
                      title={`${card.numDecks.toLocaleString()} de ${card.potentialDecks.toLocaleString()} mazos registrados`}
                    >
                      <span className="text-[10px] text-slate-400">📊</span>
                      <span>{card.inclusionPct}%</span>
                    </div>
                  </div>

                  {/* Card Art & Name */}
                  <div className="flex items-start gap-3">
                    <CardPreviewHover cardName={card.name} imageUri={card.imageUri}>
                      {card.imageUri ? (
                        <img
                          src={card.imageUri}
                          alt={card.name}
                          loading="lazy"
                          className="w-12 h-16 object-cover rounded-md border border-slate-700 hover:border-amber-400 shadow-sm shrink-0 cursor-pointer transition-colors"
                        />
                      ) : (
                        <div className="w-12 h-16 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-500 shrink-0">
                          MTG
                        </div>
                      )}
                    </CardPreviewHover>

                    <div className="min-w-0 flex-1">
                      <CardPreviewHover cardName={card.name} imageUri={card.imageUri}>
                        <h4 className="font-bold text-sm text-slate-100 hover:text-amber-300 transition-colors cursor-pointer line-clamp-2 leading-tight">
                          {card.name}
                        </h4>
                      </CardPreviewHover>

                      {/* Synergy indicator if available */}
                      {card.synergy !== 0 && (
                        <div
                          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${
                            card.synergy > 0
                              ? "text-teal-400"
                              : "text-slate-400"
                          }`}
                        >
                          <Flame className="w-3 h-3" />
                          <span>
                            {card.synergy > 0 ? `+${card.synergy}%` : `${card.synergy}%`} sinergia
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inclusion Progress Bar */}
                  <div className="mt-3 space-y-1">
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, card.inclusionPct))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  {/* Status Indicator */}
                  <div>
                    {isCardInDeck ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                        <CheckCircle2 className="h-3 w-3" />
                        En el mazo
                      </span>
                    ) : card.isInCollection ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-700/60 shadow-sm">
                        <Sparkles className="h-3 w-3 text-amber-400" />
                        En colección ({card.collectionQuantity})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">
                        Faltante
                      </span>
                    )}
                  </div>

                  {/* Add to Deck Button */}
                  {isCardInDeck ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={true}
                      className="h-8 px-2.5 text-xs text-slate-500 cursor-default"
                    >
                      <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                      Añadida
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={card.isInCollection ? "mana" : "outline"}
                      disabled={isAdding}
                      onClick={() => handleAddCard(card)}
                      className={`h-8 px-3 text-xs gap-1 font-semibold ${
                        card.isInCollection
                          ? "shadow-md shadow-amber-500/10"
                          : "border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
                      }`}
                      title="Añadir esta carta al mazo"
                    >
                      {isAdding ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Añadir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

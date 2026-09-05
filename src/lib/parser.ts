export interface ParsedCardLine {
  quantity: number;
  name: string;
  set?: string;
  collectorNumber?: string;
  isSideboard: boolean;
}

/**
 * Parses decklists in standard MTG formats:
 * - Moxfield export format: `1 Atraxa, Praetors' Voice (2XM) 198 *F*`
 * - MTG Arena format: `Deck`, `4 Lightning Bolt (CLB) 123`, `Sideboard`, `1 Force of Will`
 * - Plaintext format: `4x Lightning Bolt`, `1 Sol Ring`
 * - Sideboard lines: `SB: 1 Card` or under `// Sideboard`, `Sideboard:`, etc.
 */
export function parseDecklistText(rawText: string): ParsedCardLine[] {
  const lines = rawText.split(/\r?\n/);
  const parsedCards: ParsedCardLine[] = [];
  let inSideboard = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check for section headers
    const lower = line.toLowerCase();
    if (
      lower.startsWith("// sideboard") ||
      lower.startsWith("sideboard") ||
      lower.startsWith("//sideboard") ||
      lower === "sideboard:"
    ) {
      inSideboard = true;
      continue;
    }

    if (
      lower.startsWith("// main") ||
      lower.startsWith("deck") ||
      lower.startsWith("// deck") ||
      lower.startsWith("// commander") ||
      lower.startsWith("commander")
    ) {
      inSideboard = false;
      continue;
    }

    // Ignore other commentary lines starting with // or #
    if (line.startsWith("//") || line.startsWith("#")) {
      continue;
    }

    let isSideboardCard = inSideboard;
    let cardText = line;

    // Check for "SB: 1 Card Name" format
    if (/^sb:\s*/i.test(cardText)) {
      isSideboardCard = true;
      cardText = cardText.replace(/^sb:\s*/i, "").trim();
    }

    // Extract quantity (e.g. "4 ", "4x ", "1 ", or default 1)
    let quantity = 1;
    const qtyMatch = cardText.match(/^(\d+)(?:x|\s)\s*(.*)$/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1;
      cardText = qtyMatch[2].trim();
    }

    // Clean up trailing tags like *F*, *E*, *Foil*, etc.
    cardText = cardText.replace(/\s*\*[A-Za-z0-9]+\*\s*$/g, "").trim();

    // Extract set code and collector number if present, e.g. "(2XM) 198" or "(CLB) 12"
    let set: string | undefined;
    let collectorNumber: string | undefined;

    const setMatch = cardText.match(/\(([A-Za-z0-9_]{3,6})\)\s*([A-Za-z0-9\-pP]+)?$/i);
    if (setMatch) {
      set = setMatch[1].toLowerCase();
      collectorNumber = setMatch[2]?.trim();
      cardText = cardText.replace(/\(([A-Za-z0-9_]{3,6})\)\s*([A-Za-z0-9\-pP]+)?$/i, "").trim();
    }

    // Fallback: [SET:123] format
    const altSetMatch = cardText.match(/\[([A-Za-z0-9_]{3,6}):([A-Za-z0-9\-pP]+)\]$/i);
    if (altSetMatch) {
      set = altSetMatch[1].toLowerCase();
      collectorNumber = altSetMatch[2]?.trim();
      cardText = cardText.replace(/\[([A-Za-z0-9_]{3,6}):([A-Za-z0-9\-pP]+)\]$/i, "").trim();
    }

    if (cardText.length > 0) {
      parsedCards.push({
        quantity,
        name: cardText,
        set,
        collectorNumber,
        isSideboard: isSideboardCard,
      });
    }
  }

  return parsedCards;
}

/**
 * Pure card string utilities safe for both client and server environments.
 * Contains NO server, database, or Prisma dependencies.
 */

export function normalizeCardName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .split(" // ")[0]; // Front face for dual/split cards
}

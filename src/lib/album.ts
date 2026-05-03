import type {
  CollectionStats,
  CollectionType,
  CountryStats,
  Filters,
  Progress,
  Sticker,
  StickerStatus,
  TradeItem,
  TradeRecord,
} from "../types";

export const STATUS_LABELS: Record<StickerStatus, string> = {
  missing: "Faltante",
  owned: "La tengo",
  repeated: "Repetida",
};

export const STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-progress";
export const TRADE_HISTORY_STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-trades";
export const SPECIAL_COLLECTION_NAME = "FIFA / FWC";
export const SPONSOR_COLLECTION_NAME = "Coca-Cola";
export const TEAM_COLLECTION_NAME = "Teams / national selections";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export function getStickerQuantity(code: string, progress: Progress): number {
  const quantity = progress[code] ?? 0;
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
}

export function getStickerStatus(code: string, progress: Progress): StickerStatus {
  const quantity = getStickerQuantity(code, progress);

  if (quantity === 0) {
    return "missing";
  }

  return quantity === 1 ? "owned" : "repeated";
}

export function getOwnedStickers(catalog: Sticker[], progress: Progress): Sticker[] {
  return catalog.filter((sticker) => getStickerQuantity(sticker.code, progress) >= 1);
}

export function getMissingStickers(catalog: Sticker[], progress: Progress): Sticker[] {
  return catalog.filter((sticker) => getStickerQuantity(sticker.code, progress) === 0);
}

export function getRepeatedStickers(catalog: Sticker[], progress: Progress): Sticker[] {
  return catalog.filter((sticker) => getStickerQuantity(sticker.code, progress) > 1);
}

export function getRepeatedExtras(catalog: Sticker[], progress: Progress): number {
  return getRepeatedStickers(catalog, progress).reduce(
    (total, sticker) => total + getStickerQuantity(sticker.code, progress) - 1,
    0,
  );
}

export function getCompletionPercentage(catalog: Sticker[], progress: Progress): number {
  if (catalog.length === 0) {
    return 0;
  }

  return Math.round((getOwnedStickers(catalog, progress).length / catalog.length) * 100);
}

export function getStatsByCountry(catalog: Sticker[], progress: Progress): CountryStats[] {
  const countries = new Map<string, Sticker[]>();

  catalog.forEach((sticker) => {
    countries.set(sticker.country, [...(countries.get(sticker.country) ?? []), sticker]);
  });

  return [...countries.entries()]
    .map(([country, stickers]) => {
      const owned = getOwnedStickers(stickers, progress).length;
      const missing = getMissingStickers(stickers, progress).length;
      const repeatedStickers = getRepeatedStickers(stickers, progress);
      const repeatedExtras = repeatedStickers.reduce(
        (total, sticker) => total + getStickerQuantity(sticker.code, progress) - 1,
        0,
      );

      return {
        country,
        total: stickers.length,
        owned,
        missing,
        repeated: repeatedStickers.length,
        repeatedExtras,
        completionPercentage: stickers.length > 0 ? Math.round((owned / stickers.length) * 100) : 0,
      };
    })
    .sort((a, b) => a.country.localeCompare(b.country, "es"));
}

export function getCollectionType(sticker: Sticker): CollectionType {
  if (sticker.country === "Coca-Cola" || sticker.section === "Coca-Cola") {
    return "sponsor";
  }

  if (sticker.country === "FIFA" || sticker.section === "FIFA" || sticker.section === "FWC") {
    return "special";
  }

  return "team";
}

export function getCollectionName(sticker: Sticker): string {
  const type = getCollectionType(sticker);

  if (type === "special") {
    return SPECIAL_COLLECTION_NAME;
  }

  if (type === "sponsor") {
    return SPONSOR_COLLECTION_NAME;
  }

  return sticker.country;
}

export function getCollectionTypeLabel(type: CollectionType): string {
  if (type === "special") {
    return SPECIAL_COLLECTION_NAME;
  }

  if (type === "sponsor") {
    return SPONSOR_COLLECTION_NAME;
  }

  return TEAM_COLLECTION_NAME;
}

export function getCollectionFilterValue(sticker: Sticker): string {
  const type = getCollectionType(sticker);

  if (type === "team") {
    return "Team";
  }

  return getCollectionTypeLabel(type);
}

function getCollectionSortWeight(type: CollectionType) {
  if (type === "special") {
    return 0;
  }

  if (type === "sponsor") {
    return 1;
  }

  return 2;
}

export function getStatsByCollection(catalog: Sticker[], progress: Progress): CollectionStats[] {
  const collections = new Map<string, Sticker[]>();

  catalog.forEach((sticker) => {
    const collectionName = getCollectionName(sticker);
    collections.set(collectionName, [...(collections.get(collectionName) ?? []), sticker]);
  });

  return [...collections.entries()]
    .map(([name, stickers]) => {
      const owned = getOwnedStickers(stickers, progress).length;
      const missing = getMissingStickers(stickers, progress).length;
      const repeatedStickers = getRepeatedStickers(stickers, progress);
      const repeatedExtras = repeatedStickers.reduce(
        (total, sticker) => total + getStickerQuantity(sticker.code, progress) - 1,
        0,
      );
      const type = getCollectionType(stickers[0]);

      return {
        name,
        type,
        total: stickers.length,
        owned,
        missing,
        repeated: repeatedStickers.length,
        repeatedExtras,
        completionPercentage: stickers.length > 0 ? Math.round((owned / stickers.length) * 100) : 0,
      };
    })
    .sort(
      (a, b) =>
        getCollectionSortWeight(a.type) - getCollectionSortWeight(b.type) ||
        a.name.localeCompare(b.name, "es"),
    );
}

export function applyFilters(stickers: Sticker[], progress: Progress, filters: Filters): Sticker[] {
  const query = normalize(filters.query);

  return stickers.filter((sticker) => {
    const status = getStickerStatus(sticker.code, progress);
    const collectionName = getCollectionName(sticker);
    const collectionFilterValue = getCollectionFilterValue(sticker);
    const searchableText = normalize(
      [
        sticker.code,
        sticker.country,
        collectionName,
        sticker.group,
        sticker.section,
        sticker.number,
        sticker.displayName,
      ]
        .filter(Boolean)
        .join(" "),
    );

    return (
      (!query || searchableText.includes(query)) &&
      (!filters.country || collectionName === filters.country) &&
      (!filters.group || sticker.group === filters.group) &&
      (!filters.section || collectionFilterValue === filters.section) &&
      (filters.status === "all" || status === filters.status)
    );
  });
}

export function groupByCountry(stickers: Sticker[]): Map<string, Sticker[]> {
  return stickers.reduce((groups, sticker) => {
    const collectionName = getCollectionName(sticker);
    const current = groups.get(collectionName) ?? [];
    groups.set(collectionName, [...current, sticker]);
    return groups;
  }, new Map<string, Sticker[]>());
}

export function serializeFullProgress(catalog: Sticker[], progress: Progress): Progress {
  return catalog.reduce<Progress>((serialized, sticker) => {
    serialized[sticker.code] = getStickerQuantity(sticker.code, progress);
    return serialized;
  }, {});
}

export function exportProgressToJson(catalog: Sticker[], progress: Progress): string {
  return JSON.stringify(serializeFullProgress(catalog, progress), null, 2);
}

export function importProgressFromJson(jsonText: string, catalog: Sticker[]): Progress {
  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El archivo debe ser un objeto JSON con códigos y cantidades.");
  }

  const validCodes = new Set(catalog.map((sticker) => sticker.code));

  return Object.entries(parsed).reduce<Progress>((progress, [code, quantity]) => {
    if (!validCodes.has(code)) {
      return progress;
    }

    const numericQuantity = Number(quantity);
    progress[code] = Number.isFinite(numericQuantity) && numericQuantity > 0 ? Math.floor(numericQuantity) : 0;
    return progress;
  }, {});
}

export function toCsv(rows: Array<Record<string, string | number>>, fallbackHeaders: string[] = []): string {
  if (rows.length === 0) {
    return `${fallbackHeaders.join(",")}\n`;
  }

  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","))].join(
    "\n",
  );
}

export function getMissingExportRows(catalog: Sticker[], progress: Progress) {
  return getMissingStickers(catalog, progress).map((sticker) => ({
    Código: sticker.code,
    Colección: getCollectionName(sticker),
    Grupo: sticker.group,
    Sección: sticker.section,
  }));
}

export function getRepeatedExportRows(catalog: Sticker[], progress: Progress) {
  return getRepeatedStickers(catalog, progress).map((sticker) => ({
    Código: sticker.code,
    Colección: getCollectionName(sticker),
    Grupo: sticker.group,
    Sección: sticker.section,
    Extras: getStickerQuantity(sticker.code, progress) - 1,
  }));
}

export function toMarkdownTable(rows: Array<Record<string, string | number>>, fallbackHeaders: string[] = []) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : fallbackHeaders;

  if (headers.length === 0) {
    return "";
  }

  const formatCell = (value: string | number | undefined) => String(value ?? "").replace(/\|/g, "\\|");

  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => formatCell(row[header])).join(" | ")} |`),
  ].join("\n");
}

export function exportMissingToCsv(catalog: Sticker[], progress: Progress): string {
  return toCsv(getMissingExportRows(catalog, progress), ["Código", "Colección", "Grupo", "Sección"]);
}

export function exportRepeatedToCsv(catalog: Sticker[], progress: Progress): string {
  return toCsv(getRepeatedExportRows(catalog, progress), ["Código", "Colección", "Grupo", "Sección", "Extras"]);
}

export function exportMissingToMarkdown(catalog: Sticker[], progress: Progress): string {
  return toMarkdownTable(getMissingExportRows(catalog, progress), ["Código", "Colección", "Grupo", "Sección"]);
}

export function exportRepeatedToMarkdown(catalog: Sticker[], progress: Progress): string {
  return toMarkdownTable(getRepeatedExportRows(catalog, progress), ["Código", "Colección", "Grupo", "Sección", "Extras"]);
}

export function createTradingText(catalog: Sticker[], progress: Progress): string {
  const repeated = getRepeatedStickers(catalog, progress)
    .map((sticker) => `${sticker.code} x${getStickerQuantity(sticker.code, progress) - 1}`)
    .join(", ");

  const missing = getMissingStickers(catalog, progress)
    .map((sticker) => sticker.code)
    .join(", ");

  return `Mis repetidas:\n${repeated || "No tengo repetidas"}\n\nMe faltan:\n${missing || "No me falta ninguna"}`;
}

export function getRealGroups(catalog: Sticker[]) {
  return [...new Set(catalog.filter((sticker) => getCollectionType(sticker) === "team").map((sticker) => sticker.group))]
    .filter((group) => /^Grupo [A-L]$/.test(group))
    .sort((a, b) => a.localeCompare(b, "es"));
}

export function getTeamCollections(catalog: Sticker[], group = "") {
  return [
    ...new Set(
      catalog
        .filter((sticker) => getCollectionType(sticker) === "team")
        .filter((sticker) => !group || sticker.group === group)
        .map((sticker) => sticker.country),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
}

export function getTeamGroup(catalog: Sticker[], teamName: string) {
  return catalog.find((sticker) => getCollectionType(sticker) === "team" && sticker.country === teamName)?.group ?? "";
}

export function getUniqueValues(catalog: Sticker[], key: keyof Pick<Sticker, "country" | "group" | "section">) {
  if (key === "country") {
    return getStatsByCollection(catalog, {}).map((collection) => collection.name);
  }

  if (key === "group") {
    return getRealGroups(catalog);
  }

  return ["Team", SPECIAL_COLLECTION_NAME, SPONSOR_COLLECTION_NAME];
}

export function getTradeItemTotal(items: TradeItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function formatTradeItems(items: TradeItem[]) {
  return items.map((item) => `${item.code} x${item.quantity}`).join(", ");
}

export function applyTradeToProgress(progress: Progress, trade: Pick<TradeRecord, "gave" | "received">): Progress {
  const nextProgress = { ...progress };

  trade.gave.forEach((item) => {
    nextProgress[item.code] = Math.max(0, getStickerQuantity(item.code, nextProgress) - item.quantity);
  });

  trade.received.forEach((item) => {
    nextProgress[item.code] = getStickerQuantity(item.code, nextProgress) + item.quantity;
  });

  return nextProgress;
}

export function createTradeSummary(trade: TradeRecord) {
  const title = trade.tradedWith ? `Intercambio con ${trade.tradedWith}` : "Intercambio";
  const uneven = getTradeItemTotal(trade.gave) !== getTradeItemTotal(trade.received) ? "\nIntercambio no parejo" : "";
  const notes = trade.notes ? `\nNotas: ${trade.notes}` : "";

  return `${title}\nFecha: ${trade.createdAt.replace("T", " ")}${uneven}\nDi:\n${formatTradeItems(trade.gave)}\nRecibí:\n${formatTradeItems(
    trade.received,
  )}${notes}`;
}

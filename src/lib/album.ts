import type { CountryStats, Filters, Progress, Sticker, StickerStatus } from "../types";

export const STATUS_LABELS: Record<StickerStatus, string> = {
  missing: "Faltante",
  owned: "La tengo",
  repeated: "Repetida",
};

export const STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-progress";

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

export function applyFilters(stickers: Sticker[], progress: Progress, filters: Filters): Sticker[] {
  const query = normalize(filters.query);

  return stickers.filter((sticker) => {
    const status = getStickerStatus(sticker.code, progress);
    const searchableText = normalize(
      [sticker.code, sticker.country, sticker.group, sticker.section, sticker.number, sticker.displayName]
        .filter(Boolean)
        .join(" "),
    );

    return (
      (!query || searchableText.includes(query)) &&
      (!filters.country || sticker.country === filters.country) &&
      (!filters.group || sticker.group === filters.group) &&
      (!filters.section || sticker.section === filters.section) &&
      (filters.status === "all" || status === filters.status)
    );
  });
}

export function groupByCountry(stickers: Sticker[]): Map<string, Sticker[]> {
  return stickers.reduce((groups, sticker) => {
    const current = groups.get(sticker.country) ?? [];
    groups.set(sticker.country, [...current, sticker]);
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

export function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) {
    return "codigo,pais,grupo,seccion,cantidad,extras\n";
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

export function exportMissingToCsv(catalog: Sticker[], progress: Progress): string {
  return toCsv(
    getMissingStickers(catalog, progress).map((sticker) => ({
      codigo: sticker.code,
      pais: sticker.country,
      grupo: sticker.group,
      seccion: sticker.section,
      cantidad: 0,
      extras: 0,
    })),
  );
}

export function exportRepeatedToCsv(catalog: Sticker[], progress: Progress): string {
  return toCsv(
    getRepeatedStickers(catalog, progress).map((sticker) => {
      const quantity = getStickerQuantity(sticker.code, progress);

      return {
        codigo: sticker.code,
        pais: sticker.country,
        grupo: sticker.group,
        seccion: sticker.section,
        cantidad: quantity,
        extras: quantity - 1,
      };
    }),
  );
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

export function getUniqueValues(catalog: Sticker[], key: keyof Pick<Sticker, "country" | "group" | "section">) {
  return [...new Set(catalog.map((sticker) => sticker[key]))].sort((a, b) => a.localeCompare(b, "es"));
}

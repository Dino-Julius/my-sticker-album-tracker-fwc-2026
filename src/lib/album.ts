import type {
  AlbumGroupStats,
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
  owned: "Tengo",
  repeated: "Repetida",
};

export const STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-progress";
export const TRADE_HISTORY_STORAGE_KEY =
  "my-sticker-album-tracker-fwc-2026-trades";
export const SPECIAL_COLLECTION_NAME = "FIFA / FWC";
export const SPONSOR_COLLECTION_NAME = "Coca-Cola";
export const TEAM_COLLECTION_NAME = "Teams / national selections";

type CollectionMetadata = {
  code: string;
  displayName: string;
  emoji?: string;
  label?: string;
};

const COLLECTION_METADATA_BY_PREFIX: Record<string, CollectionMetadata> = {
  ALG: { code: "ALG", displayName: "Algeria", emoji: "🇩🇿" },
  ARG: { code: "ARG", displayName: "Argentina", emoji: "🇦🇷" },
  AUS: { code: "AUS", displayName: "Australia", emoji: "🇦🇺" },
  AUT: { code: "AUT", displayName: "Austria", emoji: "🇦🇹" },
  BEL: { code: "BEL", displayName: "Belgium", emoji: "🇧🇪" },
  BIH: { code: "BIH", displayName: "Bosnia-Herzegovina", emoji: "🇧🇦" },
  BRA: { code: "BRA", displayName: "Brazil", emoji: "🇧🇷" },
  CAN: { code: "CAN", displayName: "Canada", emoji: "🇨🇦" },
  CIV: { code: "CIV", displayName: "Côte d'Ivoire", emoji: "🇨🇮" },
  COD: { code: "COD", displayName: "Congo DR", emoji: "🇨🇩" },
  COL: { code: "COL", displayName: "Colombia", emoji: "🇨🇴" },
  CPV: { code: "CPV", displayName: "Cabo Verde", emoji: "🇨🇻" },
  CRO: { code: "CRO", displayName: "Croatia", emoji: "🇭🇷" },
  CUW: { code: "CUW", displayName: "Curaçao", emoji: "🇨🇼" },
  CZE: { code: "CZE", displayName: "Czechia", emoji: "🇨🇿" },
  ECU: { code: "ECU", displayName: "Ecuador", emoji: "🇪🇨" },
  EGY: { code: "EGY", displayName: "Egypt", emoji: "🇪🇬" },
  ENG: { code: "ENG", displayName: "Inglaterra", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  ESP: { code: "ESP", displayName: "Spain", emoji: "🇪🇸" },
  FRA: { code: "FRA", displayName: "France", emoji: "🇫🇷" },
  GER: { code: "GER", displayName: "Germany", emoji: "🇩🇪" },
  GHA: { code: "GHA", displayName: "Ghana", emoji: "🇬🇭" },
  HAI: { code: "HAI", displayName: "Haiti", emoji: "🇭🇹" },
  IRN: { code: "IRN", displayName: "IR Iran", emoji: "🇮🇷" },
  IRQ: { code: "IRQ", displayName: "Iraq", emoji: "🇮🇶" },
  JOR: { code: "JOR", displayName: "Jordan", emoji: "🇯🇴" },
  JPN: { code: "JPN", displayName: "Japan", emoji: "🇯🇵" },
  KOR: { code: "KOR", displayName: "Korea Republic", emoji: "🇰🇷" },
  KSA: { code: "KSA", displayName: "Saudi Arabia", emoji: "🇸🇦" },
  MAR: { code: "MAR", displayName: "Morocco", emoji: "🇲🇦" },
  MEX: { code: "MEX", displayName: "Mexico", emoji: "🇲🇽" },
  NED: { code: "NED", displayName: "Netherlands", emoji: "🇳🇱" },
  NOR: { code: "NOR", displayName: "Norway", emoji: "🇳🇴" },
  NZL: { code: "NZL", displayName: "New Zealand", emoji: "🇳🇿" },
  PAN: { code: "PAN", displayName: "Panama", emoji: "🇵🇦" },
  PAR: { code: "PAR", displayName: "Paraguay", emoji: "🇵🇾" },
  POR: { code: "POR", displayName: "Portugal", emoji: "🇵🇹" },
  QAT: { code: "QAT", displayName: "Qatar", emoji: "🇶🇦" },
  RSA: { code: "RSA", displayName: "South Africa", emoji: "🇿🇦" },
  SCO: { code: "SCO", displayName: "Escocia", emoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  SEN: { code: "SEN", displayName: "Senegal", emoji: "🇸🇳" },
  SUI: { code: "SUI", displayName: "Switzerland", emoji: "🇨🇭" },
  SWE: { code: "SWE", displayName: "Sweden", emoji: "🇸🇪" },
  TUN: { code: "TUN", displayName: "Tunisia", emoji: "🇹🇳" },
  TUR: { code: "TUR", displayName: "Türkiye", emoji: "🇹🇷" },
  URU: { code: "URU", displayName: "Uruguay", emoji: "🇺🇾" },
  USA: { code: "USA", displayName: "USA", emoji: "🇺🇸" },
  UZB: { code: "UZB", displayName: "Uzbekistan", emoji: "🇺🇿" },
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const GROUPS_IN_ALBUM_ORDER = Array.from(
  { length: 12 },
  (_, index) => `Grupo ${String.fromCharCode(65 + index)}`,
);

export function getStickerQuantity(code: string, progress: Progress): number {
  const quantity = progress[code] ?? 0;
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
}

export function getStickerStatus(
  code: string,
  progress: Progress,
): StickerStatus {
  const quantity = getStickerQuantity(code, progress);

  if (quantity === 0) {
    return "missing";
  }

  return quantity === 1 ? "owned" : "repeated";
}

export function getOwnedStickers(
  catalog: Sticker[],
  progress: Progress,
): Sticker[] {
  return catalog.filter(
    (sticker) => getStickerQuantity(sticker.code, progress) >= 1,
  );
}

export function getMissingStickers(
  catalog: Sticker[],
  progress: Progress,
): Sticker[] {
  return catalog.filter(
    (sticker) => getStickerQuantity(sticker.code, progress) === 0,
  );
}

export function getRepeatedStickers(
  catalog: Sticker[],
  progress: Progress,
): Sticker[] {
  return catalog.filter(
    (sticker) => getStickerQuantity(sticker.code, progress) > 1,
  );
}

export function getRepeatedExtras(
  catalog: Sticker[],
  progress: Progress,
): number {
  return getRepeatedStickers(catalog, progress).reduce(
    (total, sticker) => total + getStickerQuantity(sticker.code, progress) - 1,
    0,
  );
}

export function getCompletionPercentage(
  catalog: Sticker[],
  progress: Progress,
): number {
  if (catalog.length === 0) {
    return 0;
  }

  return Math.round(
    (getOwnedStickers(catalog, progress).length / catalog.length) * 100,
  );
}

export function getStatsByCountry(
  catalog: Sticker[],
  progress: Progress,
): CountryStats[] {
  const countries = new Map<string, Sticker[]>();

  catalog.forEach((sticker) => {
    countries.set(sticker.country, [
      ...(countries.get(sticker.country) ?? []),
      sticker,
    ]);
  });

  return [...countries.entries()]
    .map(([country, stickers]) => {
      const owned = getOwnedStickers(stickers, progress).length;
      const missing = getMissingStickers(stickers, progress).length;
      const repeatedStickers = getRepeatedStickers(stickers, progress);
      const repeatedExtras = repeatedStickers.reduce(
        (total, sticker) =>
          total + getStickerQuantity(sticker.code, progress) - 1,
        0,
      );

      return {
        country,
        total: stickers.length,
        owned,
        missing,
        repeated: repeatedStickers.length,
        repeatedExtras,
        completionPercentage:
          stickers.length > 0 ? Math.round((owned / stickers.length) * 100) : 0,
      };
    })
    .sort((a, b) => a.country.localeCompare(b.country, "es"));
}

export function getCollectionType(sticker: Sticker): CollectionType {
  if (sticker.country === "Coca-Cola" || sticker.section === "Coca-Cola") {
    return "sponsor";
  }

  if (
    sticker.country === "FIFA" ||
    sticker.section === "FIFA" ||
    sticker.section === "FWC"
  ) {
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

export function getStickerCodePrefix(sticker: Sticker): string {
  const alphaPrefix = sticker.code.match(/^[A-Z]+/)?.[0];

  if (alphaPrefix) {
    return alphaPrefix;
  }

  return getCollectionType(sticker) === "special" ? "FWC" : sticker.code;
}

export function getStickerNumberLabel(sticker: Sticker) {
  return String(sticker.number);
}

export function getCollectionMetadata(
  catalog: Sticker[],
  collectionName: string,
): CollectionMetadata {
  if (collectionName === SPECIAL_COLLECTION_NAME) {
    return { code: "FWC", displayName: SPECIAL_COLLECTION_NAME };
  }

  if (collectionName === SPONSOR_COLLECTION_NAME) {
    return { code: "CC", displayName: SPONSOR_COLLECTION_NAME };
  }

  const sticker = catalog.find(
    (candidate) => getCollectionName(candidate) === collectionName,
  );
  const prefix = sticker ? getStickerCodePrefix(sticker) : collectionName;

  return (
    COLLECTION_METADATA_BY_PREFIX[prefix] ?? {
      code: prefix,
      displayName: collectionName,
    }
  );
}

export function formatCollectionCodeLabel(
  catalog: Sticker[],
  collectionName: string,
) {
  const metadata = getCollectionMetadata(catalog, collectionName);
  if (metadata.label) {
    return metadata.label;
  }

  return `${metadata.code}${metadata.emoji ? ` ${metadata.emoji}` : ""}`;
}

export function getCollectionSearchText(
  catalog: Sticker[],
  collectionName: string,
) {
  const metadata = getCollectionMetadata(catalog, collectionName);
  const prefixes = new Set<string>();
  const countryNames = new Set<string>();
  const aliases: Record<string, string[]> = {
    CC: ["Coca Cola", "Coca-Cola"],
    ENG: ["England", "Inglaterra"],
    FWC: ["FIFA", "FWC", SPECIAL_COLLECTION_NAME],
    SCO: ["Scotland", "Escocia"],
  };

  catalog
    .filter((sticker) => getCollectionName(sticker) === collectionName)
    .forEach((sticker) => {
      prefixes.add(getStickerCodePrefix(sticker));
      countryNames.add(sticker.country);
      countryNames.add(sticker.section);
    });

  return [
    collectionName,
    metadata.code,
    metadata.displayName,
    metadata.label,
    formatCollectionCodeLabel(catalog, collectionName),
    ...prefixes,
    ...countryNames,
    ...(aliases[metadata.code] ?? []),
    ...[...prefixes].flatMap((prefix) => aliases[prefix] ?? []),
  ]
    .filter(Boolean)
    .map((value) => normalize(String(value)))
    .join(" ");
}

export function formatStickerCollectionLabel(sticker: Sticker) {
  const prefix = getStickerCodePrefix(sticker);
  const metadata = COLLECTION_METADATA_BY_PREFIX[prefix];

  if (metadata) {
    return (
      metadata.label ??
      `${metadata.code}${metadata.emoji ? ` ${metadata.emoji}` : ""}`
    );
  }

  if (getCollectionType(sticker) === "special") {
    return "FWC";
  }

  if (getCollectionType(sticker) === "sponsor") {
    return "CC";
  }

  return getCollectionName(sticker);
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

export function getAlbumGroupOrder(group: string) {
  const index = GROUPS_IN_ALBUM_ORDER.indexOf(group);
  return index === -1 ? GROUPS_IN_ALBUM_ORDER.length : index;
}

function getStickerNumberOrder(sticker: Sticker) {
  const numericNumber = Number(sticker.number);
  return Number.isFinite(numericNumber)
    ? numericNumber
    : Number.MAX_SAFE_INTEGER;
}

function getCatalogIndexMap(catalog: Sticker[]) {
  return new Map(catalog.map((sticker, index) => [sticker.code, index]));
}

function getCollectionFirstSticker(catalog: Sticker[], collectionName: string) {
  return catalog.find(
    (sticker) => getCollectionName(sticker) === collectionName,
  );
}

function getCollectionAlbumSortValues(
  catalog: Sticker[],
  collection: Pick<CollectionStats, "name" | "type">,
) {
  const firstSticker = getCollectionFirstSticker(catalog, collection.name);
  const firstIndex = firstSticker
    ? catalog.indexOf(firstSticker)
    : Number.MAX_SAFE_INTEGER;
  const groupOrder =
    firstSticker && collection.type === "team"
      ? getAlbumGroupOrder(firstSticker.group)
      : 0;

  return {
    firstIndex,
    groupOrder,
    typeWeight: getCollectionSortWeight(collection.type),
  };
}

export function sortStickersByAlbumOrder(
  stickers: Sticker[],
  catalog: Sticker[] = stickers,
) {
  const catalogIndex = getCatalogIndexMap(catalog);

  return [...stickers].sort((a, b) => {
    const groupOrder =
      getAlbumGroupOrder(a.group) - getAlbumGroupOrder(b.group);

    if (groupOrder !== 0) {
      return groupOrder;
    }

    const collectionOrder =
      (catalogIndex.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
      (catalogIndex.get(b.code) ?? Number.MAX_SAFE_INTEGER);

    if (getCollectionName(a) !== getCollectionName(b)) {
      return collectionOrder;
    }

    return (
      getStickerNumberOrder(a) - getStickerNumberOrder(b) || collectionOrder
    );
  });
}

export function getStatsByCollection(
  catalog: Sticker[],
  progress: Progress,
): CollectionStats[] {
  const collections = new Map<string, Sticker[]>();

  catalog.forEach((sticker) => {
    const collectionName = getCollectionName(sticker);
    collections.set(collectionName, [
      ...(collections.get(collectionName) ?? []),
      sticker,
    ]);
  });

  return [...collections.entries()]
    .map(([name, stickers]) => {
      const owned = getOwnedStickers(stickers, progress).length;
      const missing = getMissingStickers(stickers, progress).length;
      const repeatedStickers = getRepeatedStickers(stickers, progress);
      const repeatedExtras = repeatedStickers.reduce(
        (total, sticker) =>
          total + getStickerQuantity(sticker.code, progress) - 1,
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
        completionPercentage:
          stickers.length > 0 ? Math.round((owned / stickers.length) * 100) : 0,
      };
    })
    .sort((a, b) => {
      const aSort = getCollectionAlbumSortValues(catalog, a);
      const bSort = getCollectionAlbumSortValues(catalog, b);

      return (
        aSort.typeWeight - bSort.typeWeight ||
        aSort.groupOrder - bSort.groupOrder ||
        aSort.firstIndex - bSort.firstIndex ||
        a.name.localeCompare(b.name, "es")
      );
    });
}

export function getStatsByAlbumGroup(
  catalog: Sticker[],
  progress: Progress,
): AlbumGroupStats[] {
  const collectionStats = getStatsByCollection(catalog, progress);
  const sections = new Map<string, CollectionStats[]>();

  collectionStats.forEach((collection) => {
    const firstSticker = getCollectionFirstSticker(catalog, collection.name);
    const sectionName =
      collection.type === "team"
        ? firstSticker?.group || "Sin grupo"
        : collection.name;
    sections.set(sectionName, [
      ...(sections.get(sectionName) ?? []),
      collection,
    ]);
  });

  return [...sections.entries()]
    .map(([name, collections]) => {
      const total = collections.reduce(
        (sum, collection) => sum + collection.total,
        0,
      );
      const owned = collections.reduce(
        (sum, collection) => sum + collection.owned,
        0,
      );
      const missing = collections.reduce(
        (sum, collection) => sum + collection.missing,
        0,
      );
      const repeatedExtras = collections.reduce(
        (sum, collection) => sum + collection.repeatedExtras,
        0,
      );

      return {
        name,
        total,
        owned,
        missing,
        repeatedExtras,
        completionPercentage: total > 0 ? Math.round((owned / total) * 100) : 0,
        collections,
      };
    })
    .sort((a, b) => {
      const aSpecialOrder =
        a.name === SPECIAL_COLLECTION_NAME
          ? 0
          : a.name === SPONSOR_COLLECTION_NAME
            ? 1
            : 2;
      const bSpecialOrder =
        b.name === SPECIAL_COLLECTION_NAME
          ? 0
          : b.name === SPONSOR_COLLECTION_NAME
            ? 1
            : 2;

      return (
        aSpecialOrder - bSpecialOrder ||
        getAlbumGroupOrder(a.name) - getAlbumGroupOrder(b.name)
      );
    });
}

export function applyFilters(
  stickers: Sticker[],
  progress: Progress,
  filters: Filters,
): Sticker[] {
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

export function serializeFullProgress(
  catalog: Sticker[],
  progress: Progress,
): Progress {
  return catalog.reduce<Progress>((serialized, sticker) => {
    serialized[sticker.code] = getStickerQuantity(sticker.code, progress);
    return serialized;
  }, {});
}

export function exportProgressToJson(
  catalog: Sticker[],
  progress: Progress,
): string {
  return JSON.stringify(serializeFullProgress(catalog, progress), null, 2);
}

export function importProgressFromJson(
  jsonText: string,
  catalog: Sticker[],
): Progress {
  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "El archivo debe ser un objeto JSON con códigos y cantidades.",
    );
  }

  const validCodes = new Set(catalog.map((sticker) => sticker.code));

  return Object.entries(parsed).reduce<Progress>(
    (progress, [code, quantity]) => {
      if (!validCodes.has(code)) {
        return progress;
      }

      const numericQuantity = Number(quantity);
      progress[code] =
        Number.isFinite(numericQuantity) && numericQuantity > 0
          ? Math.floor(numericQuantity)
          : 0;
      return progress;
    },
    {},
  );
}

export function toCsv(
  rows: Array<Record<string, string | number>>,
  fallbackHeaders: string[] = [],
): string {
  if (rows.length === 0) {
    return `${fallbackHeaders.join(",")}\n`;
  }

  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCell(row[header])).join(","),
    ),
  ].join("\n");
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

export function toMarkdownTable(
  rows: Array<Record<string, string | number>>,
  fallbackHeaders: string[] = [],
) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : fallbackHeaders;

  if (headers.length === 0) {
    return "";
  }

  const formatCell = (value: string | number | undefined) =>
    String(value ?? "").replace(/\|/g, "\\|");

  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) =>
        `| ${headers.map((header) => formatCell(row[header])).join(" | ")} |`,
    ),
  ].join("\n");
}

export function exportMissingToCsv(
  catalog: Sticker[],
  progress: Progress,
): string {
  return toCsv(getMissingExportRows(catalog, progress), [
    "Código",
    "Colección",
    "Grupo",
    "Sección",
  ]);
}

export function exportRepeatedToCsv(
  catalog: Sticker[],
  progress: Progress,
): string {
  return toCsv(getRepeatedExportRows(catalog, progress), [
    "Código",
    "Colección",
    "Grupo",
    "Sección",
    "Extras",
  ]);
}

export function exportMissingToMarkdown(
  catalog: Sticker[],
  progress: Progress,
): string {
  return toMarkdownTable(getMissingExportRows(catalog, progress), [
    "Código",
    "Colección",
    "Grupo",
    "Sección",
  ]);
}

export function exportRepeatedToMarkdown(
  catalog: Sticker[],
  progress: Progress,
): string {
  return toMarkdownTable(getRepeatedExportRows(catalog, progress), [
    "Código",
    "Colección",
    "Grupo",
    "Sección",
    "Extras",
  ]);
}

export function createTradingText(
  catalog: Sticker[],
  progress: Progress,
): string {
  const missing = formatExchangeGroups(
    catalog,
    getMissingStickers(catalog, progress),
    progress,
    "missing",
  );
  const repeated = formatExchangeGroups(
    catalog,
    getRepeatedStickers(catalog, progress),
    progress,
    "swaps",
  );

  return `Me faltan\n${missing || "No me falta ninguna"}\n\nMis repetidas\n${repeated || "No tengo repetidas"}`;
}

function formatExchangeGroups(
  catalog: Sticker[],
  stickers: Sticker[],
  progress: Progress,
  mode: "missing" | "swaps",
) {
  const groups = new Map<string, Sticker[]>();

  sortStickersByAlbumOrder(stickers, catalog).forEach((sticker) => {
    const prefix = getStickerCodePrefix(sticker);
    groups.set(prefix, [...(groups.get(prefix) ?? []), sticker]);
  });

  return [...groups.entries()]
    .map(([prefix, groupStickers]) => {
      const firstSticker = groupStickers[0];
      const metadata = getCollectionMetadata(
        catalog,
        getCollectionName(firstSticker),
      );
      const label =
        metadata.label ??
        `${prefix}${metadata.emoji ? ` ${metadata.emoji}` : ""}`;
      const items = [...groupStickers]
        .sort((a, b) => Number(a.number) - Number(b.number))
        .map((sticker) => {
          const number = getStickerNumberLabel(sticker);

          if (mode === "missing") {
            return number;
          }

          const extras = getStickerQuantity(sticker.code, progress) - 1;
          return extras > 1 ? `${number} x${extras}` : number;
        })
        .join(", ");

      return `${label}: ${items}`;
    })
    .join("\n");
}

export function getRealGroups(catalog: Sticker[]) {
  return [
    ...new Set(
      catalog
        .filter((sticker) => getCollectionType(sticker) === "team")
        .map((sticker) => sticker.group),
    ),
  ]
    .filter((group) => /^Grupo [A-L]$/.test(group))
    .sort((a, b) => a.localeCompare(b, "es"));
}

export function getTeamCollections(catalog: Sticker[], group = "") {
  const teams: string[] = [];

  catalog
    .filter((sticker) => getCollectionType(sticker) === "team")
    .filter((sticker) => !group || sticker.group === group)
    .forEach((sticker) => {
      if (!teams.includes(sticker.country)) {
        teams.push(sticker.country);
      }
    });

  return teams;
}

export function getTeamGroup(catalog: Sticker[], teamName: string) {
  return (
    catalog.find(
      (sticker) =>
        getCollectionType(sticker) === "team" && sticker.country === teamName,
    )?.group ?? ""
  );
}

export function getUniqueValues(
  catalog: Sticker[],
  key: keyof Pick<Sticker, "country" | "group" | "section">,
) {
  if (key === "country") {
    return getStatsByCollection(catalog, {}).map(
      (collection) => collection.name,
    );
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

export function applyTradeToProgress(
  progress: Progress,
  trade: Pick<TradeRecord, "gave" | "received">,
): Progress {
  const nextProgress = { ...progress };

  trade.gave.forEach((item) => {
    nextProgress[item.code] = Math.max(
      0,
      getStickerQuantity(item.code, nextProgress) - item.quantity,
    );
  });

  trade.received.forEach((item) => {
    nextProgress[item.code] =
      getStickerQuantity(item.code, nextProgress) + item.quantity;
  });

  return nextProgress;
}

export function createTradeSummary(trade: TradeRecord) {
  const title = trade.tradedWith
    ? `Intercambio con ${trade.tradedWith}`
    : "Intercambio";
  const uneven =
    getTradeItemTotal(trade.gave) !== getTradeItemTotal(trade.received)
      ? "\nIntercambio no parejo"
      : "";
  const notes = trade.notes ? `\nNotas: ${trade.notes}` : "";

  return `${title}\nFecha: ${trade.createdAt.replace("T", " ")}${uneven}\nDi:\n${formatTradeItems(trade.gave)}\nRecibí:\n${formatTradeItems(
    trade.received,
  )}${notes}`;
}

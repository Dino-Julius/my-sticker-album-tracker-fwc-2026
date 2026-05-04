import type { Sticker } from "../types";

export type BulkParseResult = {
  quantities: Record<string, number>;
  unknownCodes: string[];
};

const CODE_PATTERN = /^[A-Z]*\d+$/;
const CODE_WITH_QUANTITY_PATTERN = /^([A-Z]*\d+)(?:X|:|=)(\d+)$/;
const RANGE_PATTERN = /^([A-Z]*)(\d+)-([A-Z]*)(\d+)(?:X(\d+))?$/;
const GROUPED_SECTION_PATTERN = /^([A-Z][A-Z0-9]{1,4})\b[^:]*:\s*(.+)$/u;

export function parseBulkStickerText(text: string, catalog: Sticker[]): BulkParseResult {
  const validCodes = new Set(catalog.map((sticker) => sticker.code.toUpperCase()));
  const codeByPrefixAndNumber = getCodeByPrefixAndNumber(catalog);
  const quantities: Record<string, number> = {};
  const unknownCodes = new Set<string>();

  text
    .split(/[\n\r;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      if (isSectionHeader(segment)) {
        return;
      }

      const normalizedSegment = segment.toUpperCase();
      const groupedMatch = normalizedSegment.match(GROUPED_SECTION_PATTERN);
      const groupedPrefix = groupedMatch?.[1];

      if (groupedMatch && groupedPrefix && hasPrefix(codeByPrefixAndNumber, groupedPrefix)) {
        addGroupedCodes(groupedPrefix, groupedMatch[2], codeByPrefixAndNumber, quantities, unknownCodes);
        return;
      }

      addCompactCodes(segment, validCodes, quantities, unknownCodes);
    });

  return {
    quantities,
    unknownCodes: [...unknownCodes],
  };
}

function addCompactCodes(
  text: string,
  validCodes: Set<string>,
  quantities: Record<string, number>,
  unknownCodes: Set<string>,
) {
  const normalizedText = text
    .toUpperCase()
    .replace(/([A-Z]*\d+)\s*-\s*([A-Z]*\d+)/g, "$1-$2")
    .replace(/([A-Z]*\d+)\s*(?:X|:|=)\s*(\d+)/g, "$1X$2")
    .replace(/[,\n\r\t;]+/g, " ");

  normalizedText
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const rangeMatch = token.match(RANGE_PATTERN);

      if (rangeMatch) {
        const [, startPrefix, startNumber, endPrefixRaw, endNumber, quantityRaw] = rangeMatch;
        const endPrefix = endPrefixRaw || startPrefix;
        const quantity = getPositiveQuantity(quantityRaw);

        if (startPrefix !== endPrefix) {
          unknownCodes.add(token);
          return;
        }

        const start = Number(startNumber);
        const end = Number(endNumber);
        const numberWidth = Math.max(startNumber.length, endNumber.length);
        const step = start <= end ? 1 : -1;

        for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
          addCode(`${startPrefix}${String(current).padStart(numberWidth, "0")}`, quantity, validCodes, quantities, unknownCodes);
        }

        return;
      }

      const quantityMatch = token.match(CODE_WITH_QUANTITY_PATTERN);

      if (quantityMatch) {
        addCode(quantityMatch[1], getPositiveQuantity(quantityMatch[2]), validCodes, quantities, unknownCodes);
        return;
      }

      if (CODE_PATTERN.test(token)) {
        addCode(token, 1, validCodes, quantities, unknownCodes);
      }
    });
}

function getPositiveQuantity(value: string | undefined) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
}

function addCode(
  code: string,
  quantity: number,
  validCodes: Set<string>,
  quantities: Record<string, number>,
  unknownCodes: Set<string>,
) {
  const normalizedCode = code.toUpperCase();

  if (!validCodes.has(normalizedCode)) {
    unknownCodes.add(normalizedCode);
    return;
  }

  quantities[normalizedCode] = (quantities[normalizedCode] ?? 0) + quantity;
}

function getCodeByPrefixAndNumber(catalog: Sticker[]) {
  const codes = new Map<string, string>();

  catalog.forEach((sticker) => {
    const prefix = getStickerPrefix(sticker);
    const number = Number(sticker.number);

    if (Number.isFinite(number)) {
      codes.set(`${prefix}:${number}`, sticker.code.toUpperCase());
    }
  });

  return codes;
}

function getStickerPrefix(sticker: Sticker) {
  const alphaPrefix = sticker.code.toUpperCase().match(/^[A-Z]+/)?.[0];

  if (alphaPrefix) {
    return alphaPrefix;
  }

  if (sticker.country === "FIFA") {
    return "FWC";
  }

  return sticker.code.toUpperCase();
}

function hasPrefix(codeByPrefixAndNumber: Map<string, string>, prefix: string) {
  return [...codeByPrefixAndNumber.keys()].some((key) => key.startsWith(`${prefix}:`));
}

function addGroupedCodes(
  prefix: string,
  values: string,
  codeByPrefixAndNumber: Map<string, string>,
  quantities: Record<string, number>,
  unknownCodes: Set<string>,
) {
  const normalizedValues = values.toUpperCase().replace(/(\d+)\s*(?:X|:|=)\s*(\d+)/g, "$1X$2");
  const itemPattern = /(\d+)(?:\s*-\s*(\d+))?(?:X(\d+))?/g;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(normalizedValues))) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    const quantity = getPositiveQuantity(match[3]);
    const step = start <= end ? 1 : -1;

    for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
      const code = codeByPrefixAndNumber.get(`${prefix}:${current}`);

      if (code) {
        quantities[code] = (quantities[code] ?? 0) + quantity;
      } else {
        unknownCodes.add(`${prefix}${current}`);
      }
    }
  }
}

function isSectionHeader(segment: string) {
  return /^(I NEED|NEED|ME FALTAN|FALTANTES|SWAPS|MIS REPETIDAS|REPETIDAS|EXTRAS)\s*:?\s*$/i.test(segment.trim());
}

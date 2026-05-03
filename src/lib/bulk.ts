import type { Sticker } from "../types";

export type BulkParseResult = {
  quantities: Record<string, number>;
  unknownCodes: string[];
};

const CODE_PATTERN = /^[A-Z]*\d+$/;
const CODE_WITH_QUANTITY_PATTERN = /^([A-Z]*\d+)(?:X|:|=)(\d+)$/;
const RANGE_PATTERN = /^([A-Z]*)(\d+)-([A-Z]*)(\d+)(?:X(\d+))?$/;

export function parseBulkStickerText(text: string, catalog: Sticker[]): BulkParseResult {
  const validCodes = new Set(catalog.map((sticker) => sticker.code.toUpperCase()));
  const quantities: Record<string, number> = {};
  const unknownCodes = new Set<string>();
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

  return {
    quantities,
    unknownCodes: [...unknownCodes],
  };
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

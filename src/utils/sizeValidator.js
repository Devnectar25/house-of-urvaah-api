/**
 * Size validation and normalization utility for House of Urvaah backend.
 */

const VALID_ALPHA_SIZES = new Set([
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '2XL',
  'XXXL',
  '3XL',
  '4XL',
  '5XL'
]);

const VALID_SPECIAL_SIZES = new Set([
  'FREE SIZE',
  'ONE SIZE',
  'FS'
]);

/**
 * Normalizes input string for consistent sizing:
 * - Trims whitespace
 * - Uppercases
 * - Normalizes variants like 'FREESIZE', 'FREE-SIZE' -> 'FREE SIZE'
 * - Strips trailing inch symbols: '28"' -> '28'
 */
function normalizeSize(rawSize) {
  if (!rawSize || typeof rawSize !== 'string') return '';
  let s = rawSize.trim().toUpperCase().replace(/\s+/g, ' ');

  // Normalize free / one size variants
  if (s === 'FREESIZE' || s === 'FREE-SIZE' || s === 'FREE_SIZE') return 'FREE SIZE';
  if (s === 'ONESIZE' || s === 'ONE-SIZE' || s === 'ONE_SIZE') return 'ONE SIZE';

  // Normalize quotes/inches like 28" or 28 INCH -> 28
  s = s.replace(/["']|\b(INCHES|INCH|IN)\b/gi, '').trim();

  return s;
}

/**
 * Validates whether a size string represents a valid apparel size.
 */
function isValidSize(rawSize) {
  const normalized = normalizeSize(rawSize);
  if (!normalized) return false;

  // 1. Alpha sizes (XS, S, M, L, XL, XXL, etc.)
  if (VALID_ALPHA_SIZES.has(normalized)) return true;

  // 2. Special sizes (FREE SIZE, ONE SIZE, FS)
  if (VALID_SPECIAL_SIZES.has(normalized)) return true;

  // 3. Numeric sizes (waist / bust / garment sizes, e.g., 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50)
  if (/^\d{2}$/.test(normalized)) {
    const num = parseInt(normalized, 10);
    if (num >= 20 && num <= 52) return true;
  }

  // 4. Compound sizes like "26 (XS)", "28 (S)", "30 (M)", "32 (L)", "34 (XL)", "36 (XXL)"
  if (/^\d{2}\s*\([A-Z0-9]+\)$/.test(normalized)) {
    const match = normalized.match(/^(\d{2})\s*\(([A-Z0-9]+)\)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const alpha = match[2];
      if (num >= 20 && num <= 52 && VALID_ALPHA_SIZES.has(alpha)) return true;
    }
  }

  // 5. UK / US sizes e.g. "UK 6", "UK 8", "UK 10", "US 2", "US 4"
  if (/^(UK|US)\s*\d{1,2}$/.test(normalized)) {
    const num = parseInt(normalized.replace(/^(UK|US)\s*/, ''), 10);
    if (num >= 0 && num <= 24) return true;
  }

  return false;
}

/**
 * Filters and normalizes an array of sizes to only valid unique sizes.
 */
function filterValidSizes(sizesArray) {
  if (!Array.isArray(sizesArray)) return [];
  const seen = new Set();
  const valid = [];
  for (const item of sizesArray) {
    if (typeof item !== 'string') continue;
    const norm = normalizeSize(item);
    if (isValidSize(norm) && !seen.has(norm)) {
      seen.add(norm);
      valid.push(norm);
    }
  }
  return valid;
}

module.exports = {
  VALID_ALPHA_SIZES,
  VALID_SPECIAL_SIZES,
  normalizeSize,
  isValidSize,
  filterValidSizes
};

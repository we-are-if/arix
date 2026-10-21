const fold = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("tr")
  .replaceAll("ı", "i")
  .replaceAll("ə", "e")
  .replaceAll("ş", "s")
  .replaceAll("ç", "c")
  .replaceAll("ö", "o")
  .replaceAll("ü", "u")
  .replaceAll("ğ", "g")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const tokens = (value) => fold(value).split(" ").filter(Boolean);

function levenshtein(left, right) {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

function similarity(left, right) {
  const a = fold(left);
  const b = fold(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.92;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function quantityFromLine(line) {
  const explicit = String(line).match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:m|mt|metre|meter)\b/i);
  if (explicit) return { quantity: Number(explicit[1].replace(",", ".")), token: explicit[0].trim() };
  const leading = String(line).match(/^\s*(\d+(?:[.,]\d+)?)\s+(?=[a-zA-ZƏəĞğİıÖöŞşÜüÇç])/);
  if (leading) return { quantity: Number(leading[1].replace(",", ".")), token: leading[1] };
  const trailing = String(line).match(/\s+(\d+(?:[.,]\d+)?)\s*$/);
  if (trailing) return { quantity: Number(trailing[1].replace(",", ".")), token: trailing[1] };
  return { quantity: null, token: "" };
}

function productScore(query, product) {
  const normalized = fold(query);
  const identifiers = [product.code, product.sku, product.barcode].map(fold).filter(Boolean);
  if (identifiers.some((value) => value === normalized)) return 1;
  if (identifiers.some((value) => normalized.includes(value))) return 0.99;
  const name = fold(product.name);
  if (name === normalized) return 0.98;
  const queryTokens = tokens(normalized);
  const nameTokens = tokens(name);
  const covered = nameTokens.filter((token) => queryTokens.some((candidate) => similarity(candidate, token) >= 0.78)).length;
  const coverage = nameTokens.length ? covered / nameTokens.length : 0;
  return Math.max(similarity(normalized, name), coverage * 0.94);
}

export function matchOrderLine(line, products) {
  const source = String(line ?? "").trim();
  const { quantity, token } = quantityFromLine(source);
  const query = token ? source.replace(token, " ").replace(/\s+/g, " ").trim() : source;
  const ranked = (products ?? [])
    .filter((product) => product?.active !== false && product?.type !== "service")
    .map((product) => ({ product, score: productScore(query, product) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return {
    source,
    query,
    quantity,
    unit: "mt",
    productId: best?.score >= 0.58 ? best.product.id : null,
    productName: best?.score >= 0.58 ? best.product.name : query,
    productCode: best?.score >= 0.58 ? (best.product.code || best.product.sku || "") : "",
    confidence: Number((best?.score ?? 0).toFixed(3)),
    needsReview: !quantity || !best || best.score < 0.82,
    alternatives: ranked.slice(0, 3).map(({ product, score }) => ({ id: product.id, name: product.name, code: product.code || product.sku || "", confidence: Number(score.toFixed(3)) })),
  };
}

export function parseOrderText(text, products) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => matchOrderLine(line, products));
}

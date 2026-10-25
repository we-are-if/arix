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

const joinedWordParts = new Map([
  ["kumbeji", ["kum", "beji"]],
  ["kumbaji", ["kum", "beji"]],
  ["kumbej", ["kum", "bej"]],
  ["kirikbeyaz", ["kirik", "beyaz"]],
  ["karbeyaz", ["kar", "beyaz"]],
  ["buzbeyazi", ["buz", "beyazi"]],
]);

function splitJoinedToken(token) {
  if (joinedWordParts.has(token)) return joinedWordParts.get(token);
  const abbreviation = token.match(/^(fs|fm|st|hg)([a-z]{3,})$/);
  if (abbreviation) return [abbreviation[1], abbreviation[2]];
  return [token];
}

const tokens = (value) => fold(value).split(" ").filter(Boolean).flatMap(splitJoinedToken);

export const defaultOrderAliases = [
  // Abbreviations (Qısaltmalar)
  { trigger: "fs", replacement: "folyo satin", category: "abbrev" },
  { trigger: "fm", replacement: "folyo metalik", category: "abbrev" },
  { trigger: "st", replacement: "soft touch", category: "abbrev" },
  { trigger: "hg", replacement: "high gloss", category: "abbrev" },

  // Synonyms & Variants (Sinonimlər və qarşılıqlar)
  { trigger: "parlak", replacement: "hg", category: "synonym" },
  { trigger: "parlaq", replacement: "hg", category: "synonym" },
  { trigger: "soft", replacement: "soft touch", category: "synonym" },
  { trigger: "metal", replacement: "metalik", category: "synonym" },
  { trigger: "satin", replacement: "folyo satin", category: "synonym" },
  { trigger: "folyolu", replacement: "folyo", category: "synonym" },
  { trigger: "ag", replacement: "beyaz", category: "synonym" },
  { trigger: "ak", replacement: "beyaz", category: "synonym" },
  { trigger: "qara", replacement: "siyah", category: "synonym" },
  { trigger: "boz", replacement: "gri", category: "synonym" },
];

function buildAliasMap(customAliases = []) {
  const map = new Map();

  const register = (trigger, replacement, { replace = false } = {}) => {
    const from = fold(trigger);
    const to = tokens(replacement);
    if (!from || !to.length) return;
    if (replace) {
      map.set(from, to);
      return;
    }
    const existing = map.get(from) || [];
    map.set(from, [...new Set([...existing, ...to])]);
  };

  for (const item of defaultOrderAliases) {
    register(item.trigger, item.replacement);
  }
  // Cross-link common interchangeable sets
  const linkPairs = [
    ["parlak", "hg"],
    ["parlaq", "hg"],
    ["metal", "metalik"],
    ["fs", "satin"],
    ["st", "soft"],
  ];
  for (const [a, b] of linkPairs) {
    const listA = map.get(a) || [];
    const listB = map.get(b) || [];
    map.set(a, [...new Set([...listA, b, ...tokens(b)])]);
    map.set(b, [...new Set([...listB, a, ...tokens(a)])]);
  }

  // A user-defined rule is authoritative and must override the built-in rule.
  for (const item of Array.isArray(customAliases) ? customAliases : []) {
    const customTrigger = fold(item?.trigger);
    if (customTrigger) {
      for (const [key, values] of map) {
        map.set(key, values.filter((value) => value !== customTrigger));
      }
    }
    register(item?.trigger, item?.replacement, { replace: true });
  }

  return map;
}

const lineAnnotationRules = [
  { key: "variant-1", pattern: /(?:^|\s)(-1)(?=\s|$)/giu, label: "-1" },
  { key: "new", pattern: /(?:^|\s)(yeni|new)(?=\s|$)/giu, label: "Yeni" },
  { key: "old", pattern: /(?:^|\s)(eski|köhnə|kohne|old)(?=\s|$)/giu, label: "Eski" },
];

function extractLineAnnotations(value) {
  let text = String(value ?? "");
  const annotations = [];
  for (const rule of lineAnnotationRules) {
    if (!rule.pattern.test(text)) continue;
    annotations.push({ key: rule.key, label: rule.label });
    rule.pattern.lastIndex = 0;
    text = text.replace(rule.pattern, " ");
  }
  return { text: text.replace(/\s+/g, " ").trim(), annotations };
}

function productHasAnnotation(product, annotationKey) {
  const source = [product?.name, product?.code, product?.sku].filter(Boolean).join(" ");
  if (annotationKey === "variant-1") return /-1(?=$|[\s_])/iu.test(source);
  if (annotationKey === "new") return /(?:^|\s)(yeni|new)(?=\s|$)/iu.test(source);
  if (annotationKey === "old") return /(?:^|\s)(eski|köhnə|kohne|old)(?=\s|$)/iu.test(source);
  return false;
}

function joinedTokenSpans(valueTokens, maxLength = 4) {
  const spans = [];
  for (let start = 0; start < valueTokens.length; start += 1) {
    let joined = "";
    for (let end = start; end < Math.min(valueTokens.length, start + maxLength); end += 1) {
      joined += valueTokens[end];
      if (end > start) spans.push({ value: joined, start, end });
    }
  }
  return spans;
}

function isExactProductQuery(query, product) {
  const normalized = fold(query);
  if (!normalized) return false;
  if (fold(product?.name) === normalized) return true;
  return [product?.code, product?.sku, product?.barcode].some((value) => fold(value) === normalized);
}

function expandTokens(textTokens, aliasMap) {
  const result = [];
  for (const t of textTokens) {
    const expansions = aliasMap.get(t);
    if (expansions) {
      result.push(...expansions);
    } else {
      result.push(t);
    }
  }
  return [...new Set(result)];
}

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
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.94;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function tokenSimilarity(a, b, aliasMap) {
  if (a === b) return 1;
  const expA = aliasMap.get(a) || [];
  const expB = aliasMap.get(b) || [];
  if (expA.includes(b) || expB.includes(a)) return 0.98;
  return similarity(a, b);
}

export function quantityFromLine(line) {
  const source = String(line ?? "").trim();
  const tokens = [];
  const rollAfterNumber = source.match(/(?:^|[\s\-])(\d+(?:[.,]\d+)?)\s*(?:rulo|rul|rl|vr|r|top|bobin)(?=$|[\s\-:])/i);
  const rollBeforeNumber = source.match(/(?:^|[\s\-])(?:rulo|rul|rl|vr|r|top|bobin)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)(?=$|[\s\-:])/i);
  const rollMatch = rollAfterNumber || rollBeforeNumber;
  const orderedRollCount = rollMatch
    ? Math.max(1, Math.trunc(Number(rollMatch[1].replace(",", "."))))
    : 0;
  if (rollMatch) tokens.push(rollMatch[0].trim());

  const meterAfterNumber = source.match(/(?:^|[\s\-])(\d+(?:[.,]\d+)?)\s*(?:metre|meter|mt|m)\b/i);
  const meterBeforeNumber = source.match(/(?:^|[\s\-])(?:metre|meter|mt|m)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)(?=$|[\s\-:])/i);
  const meterMatch = meterAfterNumber || meterBeforeNumber;
  const quantity = meterMatch ? Number(meterMatch[1].replace(",", ".")) : null;
  if (meterMatch) tokens.push(meterMatch[0].trim());

  if (tokens.length) {
    return {
      quantity,
      orderedRollCount,
      unit: quantity ? "mt" : "rulo",
      token: tokens[0],
      tokens,
    };
  }

  // 2. Leading quantity: '30 - FS Beyaz' or '30 FS Beyaz'
  const leading = source.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:[-*:]|\s)\s*(?=[a-zA-ZƏəĞğİıÖöŞşÜüÇç])/);
  if (leading) {
    return { quantity: Number(leading[1].replace(",", ".")), orderedRollCount: 0, unit: "mt", token: leading[0].trim(), tokens: [leading[0].trim()] };
  }

  // 3. Trailing quantity: 'FS Beyaz 30' or 'FS Beyaz - 30'
  const trailing = source.match(/(?:[-*:]|\s+)\s*(\d+(?:[.,]\d+)?)\s*$/);
  if (trailing) {
    return { quantity: Number(trailing[1].replace(",", ".")), orderedRollCount: 0, unit: "mt", token: trailing[1].trim(), tokens: [trailing[1].trim()] };
  }

  return { quantity: null, orderedRollCount: 0, unit: "mt", token: "", tokens: [] };
}

export function productScore(query, product, aliasMap = buildAliasMap()) {
  const normQuery = fold(query);
  const rawQTokens = tokens(normQuery);
  const qTokens = expandTokens(rawQTokens, aliasMap);

  const normName = fold(product.name);
  const rawPTokens = tokens(normName);
  const pTokens = expandTokens(rawPTokens, aliasMap);
  const querySpans = joinedTokenSpans(qTokens);
  const productSpans = joinedTokenSpans(pTokens);

  // Exact identifier match (code, sku, barcode)
  const identifiers = [product.code, product.sku, product.barcode].map(fold).filter(Boolean);
  if (identifiers.some((id) => id === normQuery)) return 1.0;
  if (identifiers.some((id) => normQuery.includes(id))) return 0.99;

  // Code number match (e.g. '528' matching 'ERSA 528' or '010' matching 'ERSA 010')
  for (const id of identifiers) {
    const idTokens = tokens(id);
    for (const num of rawQTokens) {
      if (/^\d+$/.test(num) && idTokens.includes(num)) {
        return 0.98;
      }
    }
  }

  // Name exact match
  if (normName === normQuery) return 0.99;

  // Generic weak tokens that shouldn't unfairly penalize when omitted
  const genericTokens = new Set(["folyo", "folyolu", "ersa"]);

  let matchWeight = 0;
  let totalQueryWeight = 0;

  for (const [queryIndex, qt] of qTokens.entries()) {
    const isGeneric = genericTokens.has(qt);
    const weight = isGeneric ? 0.25 : 1.0;
    totalQueryWeight += weight;

    let bestSim = 0;
    for (const pt of pTokens) {
      const sim = tokenSimilarity(qt, pt, aliasMap);
      if (sim > bestSim) bestSim = sim;
    }
    for (const span of productSpans) bestSim = Math.max(bestSim, similarity(qt, span.value));
    if (querySpans.some((span) => span.start <= queryIndex && span.end >= queryIndex && pTokens.includes(span.value))) bestSim = 1;
    matchWeight += bestSim * weight;
  }

  let productCoverageWeight = 0;
  let totalProductWeight = 0;

  for (const [productIndex, pt] of pTokens.entries()) {
    const isGeneric = genericTokens.has(pt);
    const weight = isGeneric ? 0.25 : 1.0;
    totalProductWeight += weight;

    let bestSim = 0;
    for (const qt of qTokens) {
      const sim = tokenSimilarity(qt, pt, aliasMap);
      if (sim > bestSim) bestSim = sim;
    }
    if (querySpans.some((span) => span.value === pt)) bestSim = 1;
    for (const span of productSpans) {
      if (span.start <= productIndex && span.end >= productIndex) {
        for (const qt of qTokens) bestSim = Math.max(bestSim, similarity(qt, span.value));
      }
    }
    productCoverageWeight += bestSim * weight;
  }

  const queryRecall = totalQueryWeight > 0 ? matchWeight / totalQueryWeight : 0;
  const productPrecision = totalProductWeight > 0 ? productCoverageWeight / totalProductWeight : 0;

  // Balance between what user wrote and product token coverage
  return Number(((queryRecall * 0.70) + (productPrecision * 0.30)).toFixed(3));
}

export function matchOrderLine(line, products, customAliases = []) {
  const source = String(line ?? "").trim();
  const { text: sourceWithoutAnnotations, annotations } = extractLineAnnotations(source);
  const { quantity, orderedRollCount, unit, token, tokens = [] } = quantityFromLine(sourceWithoutAnnotations);
  let query = tokens.length
    ? tokens.reduce((value, currentToken) => value.replace(currentToken, " "), sourceWithoutAnnotations).replace(/\s+/g, " ")
    : token ? sourceWithoutAnnotations.replace(token, " ").replace(/\s+/g, " ") : sourceWithoutAnnotations;
  query = query.replace(/^[-*:\s]+|[-*:\s]+$/g, "").trim();

  const aliasMap = buildAliasMap(customAliases);

  const ranked = (products ?? [])
    .filter((product) => product?.active !== false && product?.type !== "service")
    .map((product) => {
      const exact = isExactProductQuery(query, product);
      const annotationMatch = annotations.some((annotation) => productHasAnnotation(product, annotation.key));
      const baseScore = productScore(query, product, aliasMap);
      const hasUnrequestedVariant = productHasAnnotation(product, "variant-1")
        && !annotations.some((annotation) => annotation.key === "variant-1");
      return {
        product,
        exact,
        annotationMatch,
        score: Math.max(0, Math.min(1, baseScore + (annotationMatch ? 0.045 : 0) - (hasUnrequestedVariant ? 0.035 : 0))),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  const scoreGap = best ? best.score - (runnerUp?.score ?? 0) : 0;
  const hasDecisiveAnnotation = Boolean(best?.annotationMatch && !runnerUp?.annotationMatch);
  const isAmbiguous = Boolean(best && !best.exact && !hasDecisiveAnnotation && scoreGap < 0.02);
  const isHighConfidence = Boolean(best && best.score >= 0.76 && !isAmbiguous);
  const isDecisiveCatalogMatch = Boolean(best && best.score >= 0.80 && scoreGap >= 0.08);
  const unmatchedAnnotations = annotations.filter((annotation) => !best || !productHasAnnotation(best.product, annotation.key));

  return {
    source,
    query,
    quantity,
    unit,
    orderedRollCount,
    productId: isHighConfidence ? best.product.id : null,
    productName: isHighConfidence ? best.product.name : query,
    productCode: isHighConfidence ? (best.product.code || best.product.sku || "") : "",
    lineNote: unmatchedAnnotations.map((annotation) => annotation.label).join(", "),
    confidence: Number((best?.score ?? 0).toFixed(3)),
    needsReview: !(quantity || orderedRollCount) || !best || !isHighConfidence || (!best.exact && best.score < 0.86 && !isDecisiveCatalogMatch),
    alternatives: ranked.slice(0, 4).map(({ product, score }) => ({
      id: product.id,
      name: product.name,
      code: product.code || product.sku || "",
      confidence: Number(score.toFixed(3)),
    })),
  };
}

export function parseOrderText(text, products, customAliases = []) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => matchOrderLine(line, products, customAliases));
}

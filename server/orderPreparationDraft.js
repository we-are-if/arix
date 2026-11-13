import { preparationContentPatch } from './orderPreparationContent.js';

export function prepareDraftItems(existing, submitted, isCustom, normalizeAllowance) {
  if (!Array.isArray(submitted) || submitted.length !== existing.length) return { error: 'Taslak ürün satırları eksik veya fazla.' };
  const items = [];
  for (const [index, item] of existing.entries()) {
    const row = submitted[index];
    if (!row || String(row.productId ?? '') !== String(item.productId ?? '') || row.productName !== item.productName || row.productCode !== item.productCode) return { error: 'Taslak ürün sırası değişti. Siparişi yeniden açın.' };
    const quantity = Number(row.preparedQuantity ?? 0);
    const rolls = Number(row.preparedRollCount ?? 0);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(rolls) || rolls < 0) return { error: 'Hazırlanan miktar ve rulo sayısı geçerli olmalıdır.' };
    const content = preparationContentPatch(item, row, isCustom(item));
    if (content.error) return content;
    const merged = { ...item, ...content.patch, preparedQuantity: quantity, preparedRollCount: rolls,
      cutAllowanceApplied: row.cutAllowanceApplied === true, cutPieceCount: row.cutPieceCount, cutAllowancePerPiece: row.cutAllowancePerPiece };
    items.push({ ...merged, ...normalizeAllowance(merged) });
  }
  return { items };
}

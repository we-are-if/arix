const units = new Set(['M2', 'M', 'ROLL', 'BOX', 'BUCKET', 'PCS', 'KG', 'LT', 'ML', 'GR', 'SET', 'PALLET', 'BAG', 'CRATE', 'BUNDLE']);

// Only explicitly supplied content fields may change; never change package count.
export function preparationContentPatch(item, body, custom) {
  const provided = body.innerUnit !== undefined || body.innerQuantity !== undefined;
  if (!provided) return { patch: {}, changed: false };
  if (!custom) return { error: 'Alt ölçü yalnız harici ürünlerde değiştirilebilir.' };
  const patch = {};
  if (body.innerUnit !== undefined) {
    const unit = String(body.innerUnit).trim().toUpperCase();
    if (unit && !units.has(unit)) return { error: 'Geçerli bir alt birim seçin.' };
    patch.innerUnit = unit;
  }
  if (body.innerQuantity !== undefined) {
    const quantity = Number(body.innerQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) return { error: 'Paket içeriği sıfır veya pozitif bir sayı olmalıdır.' };
    patch.innerQuantity = quantity;
  }
  if (Number(patch.innerQuantity ?? item.innerQuantity) > 0 && !(patch.innerUnit ?? item.innerUnit)) {
    return { error: 'Paket içeriği için alt birim seçin.' };
  }
  return { patch, changed: Object.entries(patch).some(([key, value]) => (item[key] ?? (key === 'innerUnit' ? '' : 0)) !== value) };
}

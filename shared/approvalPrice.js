export function domesticFinalMultiplier(vatRate, vatIncluded, overallDiscountRate) {
  const discount = 1 - Math.min(100, Math.max(0, Number(overallDiscountRate) || 0)) / 100;
  const tax = vatIncluded ? 1 : 1 + Math.max(0, Number(vatRate) || 0) / 100;
  return discount * tax;
}

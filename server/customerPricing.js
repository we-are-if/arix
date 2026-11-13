export function productStorePrice(product, store) {
  return Number(product.storePrices?.[store] ?? product.salePrice ?? 0);
}

export function resolvedCustomerPrice(db, product, customerId, store) {
  const rule = customerId
    ? db.customerPrices.find((item) =>
        Number(item.customerId) === Number(customerId)
        && Number(item.productId) === Number(product.id)
        && item.store === store
      )
    : null;
  const standardPrice = productStorePrice(product, store);
  return {
    id: rule?.id ?? null,
    customerId: customerId ? Number(customerId) : null,
    productId: product.id,
    productName: product.name,
    code: product.code ?? "",
    sku: product.sku ?? "",
    unit: product.unit ?? "əd",
    store,
    standardPrice,
    customerPrice: rule ? Number(rule.price) : null,
    effectivePrice: rule ? Number(rule.price) : standardPrice,
    source: rule ? "customer" : "store",
  };
}

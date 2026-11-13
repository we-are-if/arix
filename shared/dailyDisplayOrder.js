export function isTrailingDailyEntry(entry, companyId) {
  if (companyId === "sparexpert") return entry.kind === "transfer";
  if (companyId === "azartmembran") return entry.kind === "expense" && String(entry.category || "").normalize("NFC").toLocaleLowerCase("az-AZ").includes("təch");
  return false;
}

export function orderDailyDisplayEntries(entries, companyId) {
  return [...entries].sort((a, b) => Number(isTrailingDailyEntry(a, companyId)) - Number(isTrailingDailyEntry(b, companyId))
    || String(a.time || "").localeCompare(String(b.time || "")));
}

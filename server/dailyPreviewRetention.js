// Matching produces structured invoice data. These two fields are only disposable
// source previews, never the generated customer PDF or financial invoice fields.
export const SOURCE_PREVIEW_KEYS = new Set(["screenshotDataUrl", "returnScreenshotDataUrl"]);

export function removeSourcePreviews(value) {
  let removed = 0;
  if (!value || typeof value !== "object") return removed;
  for (const key of Object.keys(value)) {
    if (SOURCE_PREVIEW_KEYS.has(key)) {
      delete value[key];
      removed++;
    } else removed += removeSourcePreviews(value[key]);
  }
  return removed;
}

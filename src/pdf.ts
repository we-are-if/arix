type PaperMode = "portrait" | "landscape";

const waitForImages = async (root: Document) => {
  const images = Array.from(root.images).filter((image) => !image.complete);
  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
};

export async function htmlDocumentToPdf(html: string, filename: string, paperMode: PaperMode) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;border:0;width:${paperMode === "landscape" ? 1123 : 794}px;height:1123px;opacity:0;pointer-events:none`;
  iframe.srcdoc = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      iframe.addEventListener("error", () => reject(new Error("PDF görünüşü hazırlana bilmədi.")), { once: true });
    });
    const frameDocument = iframe.contentDocument;
    if (!frameDocument?.body) throw new Error("PDF görünüşü hazırlana bilmədi.");
    await frameDocument.fonts?.ready;
    await waitForImages(frameDocument);
    const { default: html2pdf } = await import("html2pdf.js");
    const worker = html2pdf().set({
      filename,
      margin: 0,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: paperMode },
    }).from(frameDocument.body);
    const blob = await worker.outputPdf("blob");
    if (!(blob instanceof Blob) || blob.size === 0) throw new Error("PDF faylı yaradıla bilmədi.");
    return blob;
  } finally {
    iframe.remove();
  }
}

export async function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("PDF oxunmadı."));
    reader.readAsDataURL(blob);
  });
}

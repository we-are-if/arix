import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

type PositionedPdfText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QaimePdfReadResult = {
  text: string;
  previewBlob: Blob;
  hasEmbeddedText: boolean;
  pageCount: number;
};

let workerConfigured = false;

function median(values: number[]): number {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 8;
  return sorted[Math.floor(sorted.length / 2)];
}

export function pdfTextItemsToLines(items: PositionedPdfText[]): string[] {
  if (!items.length) return [];
  const medianHeight = median(items.map((item) => item.height));
  const tolerance = Math.max(1.5, medianHeight * 0.35);
  const rows: Array<{ y: number; items: PositionedPdfText[] }> = [];

  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (row) {
      row.items.push(item);
      row.y = row.items.reduce((sum, current) => sum + current.y, 0) / row.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const sorted = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let rightEdge = 0;
      for (const item of sorted) {
        const gap = line ? item.x - rightEdge : 0;
        const separator = !line ? "" : gap > Math.max(8, medianHeight * 1.5) ? "\t" : " ";
        line += `${separator}${item.text.trim()}`;
        rightEdge = Math.max(rightEdge, item.x + item.width);
      }
      return line.replace(/\s+$/g, "").trim();
    })
    .filter(Boolean);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PDF ön baxışı yaradıla bilmədi.")), "image/png");
  });
}

export async function readQaimePdf(file: File): Promise<QaimePdfReadResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerConfigured = true;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const documentProxy = await loadingTask.promise;
  const pageCount = documentProxy.numPages;
  const pageTexts: string[] = [];
  let previewBlob: Blob | null = null;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const content = await page.getTextContent();
      const positioned = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        return [{
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: Number(item.width) || 0,
          height: Math.abs(item.transform[3]) || Number(item.height) || 0,
        }];
      });
      pageTexts.push(pdfTextItemsToLines(positioned).join("\n"));

      if (pageNumber === 1) {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(3, Math.max(2, 2200 / Math.max(1, baseViewport.width)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("PDF səhifəsi göstərilə bilmədi.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        previewBlob = await canvasToBlob(canvas);
      }
    }
  } finally {
    await documentProxy.destroy();
  }

  if (!previewBlob) throw new Error("PDF səhifəsi tapılmadı.");
  const text = pageTexts.filter(Boolean).join("\n");
  const meaningfulText = text.replace(/\s+/g, " ").trim();
  return {
    text,
    previewBlob,
    hasEmbeddedText: meaningfulText.length >= 40,
    pageCount,
  };
}

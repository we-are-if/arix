import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import template from './exportDocumentTemplate.cjs';

const types = new Set(['proforma', 'commercial_invoice', 'packing_list']);
const units = new Set(['M2','M','ROLL','BOX','BUCKET','PCS','KG','LT','ML','GR','SET','PALLET','BAG','CRATE','BUNDLE']);
const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 409 }); };

export function selectExportDocument(order, request = {}) {
  const root = order.approvalForm;
  const type = request.documentType;
  if (!types.has(type)) fail('Belge türü eksik. Sayfayı yenileyip belgeyi tekrar açın.');
  const form = root?.documentType === type ? root : root?.exportDocuments?.[type];
  if (!form || form.documentType !== type) fail('Bu yurtdışı belge henüz kaydedilmemiş. Önce kaydedin.');
  if (!request.expectedUpdatedAt || request.expectedUpdatedAt !== form.updatedAt) {
    fail('Belgenin daha güncel bir sürümü var. Kapatıp tekrar açın; eski sürüm yazdırılmadı.');
  }
  return form;
}

export function validateExportDocument(form) {
  if (!types.has(form?.documentType)) fail('Yalnız yurtdışı belge oluşturulabilir.');
  if (!Array.isArray(form.lines) || !form.lines.length) fail('Belgede ürün bulunamadı.');
  for (const [i, line] of form.lines.entries()) {
    if (!units.has(line.unit || 'M2') || (line.innerUnit && !units.has(line.innerUnit))) fail(`${i+1}. ürünün birimi geçersiz. Belgeyi düzenleyip kaydedin.`);
    for (const field of ['quantity','unitPrice','discountRate','vatRate']) {
      if (!Number.isFinite(line[field]) || line[field] < 0) fail(`${i+1}. ürünün ${field} bilgisi geçersiz.`);
    }
  }
  if (form.documentType !== 'packing_list') return;
  const allocations = form.palletAllocations;
  if (!allocations?.length || allocations.length !== form.palletDetails?.length) fail('Palet dağılımını ve ağırlıklarını tamamlayıp kaydedin.');
  const quantities = form.lines.map(() => 0), rolls = form.lines.map(() => 0);
  allocations.forEach((entries, p) => {
    const detail = form.palletDetails[p];
    if (!(detail.grossWeight > detail.tareWeight && detail.tareWeight >= 0)) fail(`Palet ${p+1}: brüt ve dara ağırlığını kontrol edin.`);
    const items = entries.map(e => {
      const line = form.lines[e.lineIndex];
      if (!line || !Number.isFinite(e.quantity) || e.quantity < 0 || !Number.isFinite(e.rolls) || e.rolls < 0) fail(`Palet ${p+1}: ürün dağılımı geçersiz.`);
      quantities[e.lineIndex] += e.quantity; rolls[e.lineIndex] += e.rolls;
      return { ...e, line };
    });
    const weights = template.computePalletItemWeights(items, detail);
    const net = weights.reduce((s,w) => s+w.netWeight,0);
    if (Math.abs(net - (detail.grossWeight-detail.tareWeight)) > Math.max(0.05, items.length*0.01)) fail(`Palet ${p+1}: ürün net ağırlıkları palet toplamıyla uyuşmuyor.`);
  });
  form.lines.forEach((line,i) => {
    if (Math.abs(rolls[i] - Number(line.rollCount || 0)) > 0.001 || Math.abs(quantities[i]-line.quantity) > 0.05) fail(`${line.productName}: palet miktarı belgeyle uyuşmuyor. Dağılımı kontrol edin.`);
  });
}

export function createExportPdfAuthority({ directory, render, printSettings, products }) {
  const pending = new Map();
  return async (order, form, db) => {
    validateExportDocument(form);
    const html = template.exportHtml(order, form, printSettings(db), products(db));
    const fingerprint = createHash('sha256').update(html).digest('hex');
    const destination = join(directory, `${fingerprint}.pdf`);
    const read = async () => {
      const bytes = await readFile(destination);
      if (bytes.subarray(0,5).toString() !== '%PDF-') throw new Error('Invalid cached PDF');
      return { pdf: bytes, fingerprint };
    };
    try { return await read(); } catch (e) { if (e.code && e.code !== 'ENOENT') throw e; }
    if (pending.has(fingerprint)) return pending.get(fingerprint);
    const work = (async () => {
      const pdf = await render(html);
      await mkdir(directory, { recursive: true });
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, pdf, { flag: 'wx' }); await rename(temporary, destination); }
      finally { await unlink(temporary).catch(() => {}); }
      return { pdf, fingerprint };
    })();
    pending.set(fingerprint, work);
    try { return await work; } finally { pending.delete(fingerprint); }
  };
}

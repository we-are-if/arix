import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createTcmbRateService({ fetchImpl = globalThis.fetch, cacheFile, now = Date.now, requestTimeoutMs = 6000, totalTimeoutMs = 12000 } = {}) {
  const days = new Map();
  const missing = new Map();
  const pendingDays = new Map();
  const pendingRates = new Map();
  let writes = Promise.resolve();
  const ready = cacheFile ? readFile(cacheFile, 'utf8').then(raw => {
    for (const [date, rates] of Object.entries(JSON.parse(raw))) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && ['USD', 'EUR'].every(c => Number.isFinite(rates[c]) && rates[c] > 0)) days.set(date, rates);
    }
  }).catch(() => {}) : Promise.resolve();
  const persist = () => {
    if (!cacheFile) return;
    writes = writes.then(async () => {
      await mkdir(dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile + '.tmp', JSON.stringify(Object.fromEntries(days)), { mode: 0o600 });
      await rename(cacheFile + '.tmp', cacheFile);
    }).catch(() => {});
  };
  async function publication(date) {
    await ready;
    if (days.has(date)) return days.get(date);
    if ((missing.get(date) || 0) > now()) return null;
    if (pendingDays.has(date)) return pendingDays.get(date);
    const task = (async () => {
      const [year, month, day] = date.split('-');
      const signal = AbortSignal.timeout(requestTimeoutMs);
      const response = await fetchImpl(`https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`, { headers: { accept: 'application/xml' }, signal });
      if (response.status === 404) { missing.set(date, now() + 15 * 60_000); return null; }
      if (!response.ok) throw new Error('TCMB geçici olarak yanıt vermiyor. Tekrar deneyin.');
      const xml = await response.text();
      const rates = {};
      for (const currency of ['USD', 'EUR']) {
        const block = xml.match(new RegExp(`<Currency[^>]+CurrencyCode=["']${currency}["'][\\s\\S]*?<\\/Currency>`))?.[0];
        const unit = Number(block?.match(/<Unit>([^<]+)<\/Unit>/)?.[1] || 1);
        const selling = Number(block?.match(/<BanknoteSelling>([^<]+)<\/BanknoteSelling>/)?.[1]);
        if (!Number.isFinite(selling) || selling <= 0 || !Number.isFinite(unit) || unit <= 0) throw new Error('TCMB efektif satış kuru doğrulanamadı.');
        rates[currency] = selling / unit;
      }
      days.set(date, rates);
      persist();
      return rates;
    })();
    pendingDays.set(date, task);
    try { return await task; } finally { pendingDays.delete(date); }
  }
  async function get(currency, beforeDate) {
    if (!['TRY', 'USD', 'EUR'].includes(currency)) throw new Error('Desteklenmeyen para birimi.');
    const cursor = new Date(`${beforeDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate) || !Number.isFinite(cursor.getTime()) || cursor.toISOString().slice(0, 10) !== beforeDate) throw new Error('Geçersiz kur tarihi.');
    if (currency === 'TRY') return { currency, rate: 1, date: beforeDate };
    const key = `${currency}:${beforeDate}`;
    if (pendingRates.has(key)) return pendingRates.get(key);
    const task = (async () => {
      const started = now();
      for (let attempt = 0; attempt < 10; attempt++) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        if ([0, 6].includes(cursor.getUTCDay())) continue;
        if (now() - started >= totalTimeoutMs) break;
        const date = cursor.toISOString().slice(0, 10);
        const rates = await publication(date);
        if (rates) return { currency, rate: rates[currency], date, source: 'TCMB Efektif Satış' };
      }
      throw new Error('TCMB önceki yayımlanmış günün kuru alınamadı. Tekrar deneyin.');
    })();
    pendingRates.set(key, task);
    try { return await task; } finally { pendingRates.delete(key); }
  }
  return { get, flush: () => writes };
}


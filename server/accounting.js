import { randomUUID } from "node:crypto";

const seedAccounts = [
  ["100", "KASA", "asset"], ["101", "ALINAN ÇEKLER", "asset"], ["102", "BANKALAR", "asset"],
  ["103", "VERİLEN ÇEKLER VE ÖDEME EMİRLERİ (-)", "asset"], ["108", "DİĞER HAZIR DEĞERLER", "asset"],
  ["110", "HİSSE SENETLERİ", "asset"], ["111", "ÖZEL KESİM TAHVİL, SENET VE BONOLARI", "asset"],
  ["112", "KAMU KESİMİ TAHVİL, SENET VE BONOLARI", "asset"], ["118", "DİĞER MENKUL KIYMETLER", "asset"],
  ["119", "MENKUL KIYMETLER DEĞER DÜŞÜKLÜĞÜ KARŞILIĞI (-)", "asset"], ["120", "ALICILAR", "asset"],
  ["121", "ALACAK SENETLERİ", "asset"], ["122", "ALACAK SENETLERİ REESKONTU (-)", "asset"],
  ["126", "VERİLEN DEPOZİTO VE TEMİNATLAR", "asset"], ["127", "DİĞER TİCARİ ALACAKLAR", "asset"],
  ["128", "ŞÜPHELİ TİCARİ ALACAKLAR", "asset"], ["129", "ŞÜPHELİ TİCARİ ALACAKLAR KARŞILIĞI (-)", "asset"],
  ["131", "ORTAKLARDAN ALACAKLAR", "asset"], ["132", "İŞTİRAKLERDEN ALACAKLAR", "asset"],
  ["133", "BAĞLI ORTAKLIKLARDAN ALACAKLAR", "asset"], ["135", "PERSONELDEN ALACAKLAR", "asset"],
  ["136", "DİĞER ÇEŞİTLİ ALACAKLAR", "asset"], ["137", "DİĞER ALACAK SENETLERİ REESKONTU (-)", "asset"],
  ["138", "ŞÜPHELİ DİĞER ALACAKLAR", "asset"], ["139", "ŞÜPHELİ DİĞER ALACAKLAR KARŞILIĞI (-)", "asset"],
  ["150", "İLK MADDE VE MALZEME", "asset"], ["151", "YARI MAMULLER - ÜRETİM", "asset"],
  ["152", "MAMULLER", "asset"], ["153", "TİCARİ MALLAR", "asset"], ["157", "DİĞER STOKLAR", "asset"],
  ["158", "STOK DEĞER DÜŞÜKLÜĞÜ KARŞILIĞI (-)", "asset"], ["159", "VERİLEN SİPARİŞ AVANSLARI", "asset"],
  ["180", "GELECEK AYLARA AİT GİDERLER", "asset"], ["181", "GELİR TAHAKKUKLARI", "asset"],
  ["190", "DEVREDEN KDV", "asset"], ["191", "İNDİRİLECEK KDV", "asset"], ["192", "DİĞER KDV", "asset"],
  ["193", "PEŞİN ÖDENEN VERGİLER VE FONLAR", "asset"], ["195", "İŞ AVANSLARI", "asset"],
  ["196", "PERSONEL AVANSLARI", "asset"], ["197", "SAYIM VE TESELLÜM NOKSANLARI", "asset"],
  ["198", "DİĞER ÇEŞİTLİ DÖNEN VARLIKLAR", "asset"], ["199", "DİĞER DÖNEN VARLIKLAR KARŞILIĞI (-)", "asset"],
  ["220", "ALICILAR", "asset"], ["221", "ALACAK SENETLERİ", "asset"], ["226", "VERİLEN DEPOZİTO VE TEMİNATLAR", "asset"],
  ["240", "BAĞLI MENKUL KIYMETLER", "asset"], ["242", "İŞTİRAKLER", "asset"], ["245", "BAĞLI ORTAKLIKLAR", "asset"],
  ["250", "ARAZİ VE ARSALAR", "asset"], ["251", "YERALTI VE YERÜSTÜ DÜZENLERİ", "asset"],
  ["252", "BİNALAR", "asset"], ["253", "TESİS, MAKİNE VE CİHAZLAR", "asset"], ["254", "TAŞITLAR", "asset"],
  ["255", "DEMİRBAŞLAR", "asset"], ["256", "DİĞER MADDİ DURAN VARLIKLAR", "asset"],
  ["257", "BİRİKMİŞ AMORTİSMANLAR (-)", "asset"], ["258", "YAPILMAKTA OLAN YATIRIMLAR", "asset"],
  ["259", "VERİLEN AVANSLAR", "asset"], ["260", "HAKLAR", "asset"], ["261", "ŞEREFİYE", "asset"],
  ["262", "KURULUŞ VE ÖRGÜTLENME GİDERLERİ", "asset"], ["263", "ARAŞTIRMA VE GELİŞTİRME GİDERLERİ", "asset"],
  ["264", "ÖZEL MALİYETLER", "asset"], ["267", "DİĞER MADDİ OLMAYAN DURAN VARLIKLAR", "asset"],
  ["268", "BİRİKMİŞ AMORTİSMANLAR (-)", "asset"], ["269", "VERİLEN AVANSLAR", "asset"],
  ["280", "GELECEK YILLARA AİT GİDERLER", "asset"], ["281", "GELİR TAHAKKUKLARI", "asset"],
  ["300", "BANKA KREDİLERİ", "liability"], ["301", "FİNANSAL KİRALAMA İŞLEMLERİNDEN BORÇLAR", "liability"],
  ["303", "UZUN VADELİ KREDİLERİN ANAPARA TAKSİTLERİ VE FAİZLERİ", "liability"],
  ["320", "SATICILAR", "liability"], ["321", "BORÇ SENETLERİ", "liability"],
  ["322", "BORÇ SENETLERİ REESKONTU (-)", "liability"], ["326", "ALINAN DEPOZİTO VE TEMİNATLAR", "liability"],
  ["329", "DİĞER TİCARİ BORÇLAR", "liability"], ["331", "ORTAKLARA BORÇLAR", "liability"],
  ["332", "İŞTİRAKLERE BORÇLAR", "liability"], ["333", "BAĞLI ORTAKLIKLARA BORÇLAR", "liability"],
  ["335", "PERSONELE BORÇLAR", "liability"], ["336", "DİĞER ÇEŞİTLİ BORÇLAR", "liability"],
  ["340", "ALINAN SİPARİŞ AVANSLARI", "liability"], ["350", "YILLARA YAYGIN İNŞAAT VE ONARIM HAKEDİŞ BEDELLERİ", "liability"],
  ["360", "ÖDENECEK VERGİ VE FONLAR", "liability"], ["361", "ÖDENECEK SOSYAL GÜVENLİK KESİNTİLERİ", "liability"],
  ["368", "VADESİ GEÇMİŞ, ERTELENMİŞ VEYA TAKSİTLENDİRİLMİŞ VERGİ VE DİĞER YÜKÜMLÜLÜKLER", "liability"],
  ["370", "DÖNEM KÂRI VERGİ VE DİĞER YASAL YÜKÜMLÜLÜK KARŞILIKLARI", "liability"],
  ["371", "DÖNEM KÂRININ PEŞİN ÖDENEN VERGİ VE DİĞER YÜKÜMLÜLÜKLERİ (-)", "liability"],
  ["372", "KIDEM TAZMİNATI KARŞILIĞI", "liability"], ["380", "GELECEK AYLARA AİT GELİRLER", "liability"],
  ["381", "GİDER TAHAKKUKLARI", "liability"], ["391", "HESAPLANAN KDV", "liability"],
  ["397", "SAYIM VE TESELLÜM FAZLALARI", "liability"], ["399", "DİĞER ÇEŞİTLİ YABANCI KAYNAKLAR", "liability"],
  ["400", "BANKA KREDİLERİ", "liability"], ["401", "FİNANSAL KİRALAMA İŞLEMLERİNDEN BORÇLAR", "liability"],
  ["420", "SATICILAR", "liability"], ["421", "BORÇ SENETLERİ", "liability"],
  ["426", "ALINAN DEPOZİTO VE TEMİNATLAR", "liability"], ["429", "DİĞER TİCARİ BORÇLAR", "liability"],
  ["431", "ORTAKLARA BORÇLAR", "liability"], ["438", "KAMUYA OLAN ERTELENMİŞ VEYA TAKSİTLENDİRİLMİŞ BORÇLAR", "liability"],
  ["440", "ALINAN SİPARİŞ AVANSLARI", "liability"], ["472", "KIDEM TAZMİNATI KARŞILIĞI", "liability"],
  ["480", "GELECEK YILLARA AİT GELİRLER", "liability"], ["481", "GİDER TAHAKKUKLARI", "liability"],
  ["500", "SERMAYE", "equity"], ["501", "ÖDENMEMİŞ SERMAYE (-)", "equity"],
  ["502", "SERMAYE DÜZELTMESİ OLUMLU FARKLARI", "equity"], ["520", "HİSSE SENEDİ İHRAÇ PRİMLERİ", "equity"],
  ["521", "HİSSE SENEDİ İPTAL KÂRLARI", "equity"], ["522", "MADDİ DURAN VARLIK YENİDEN DEĞERLEME ARTIŞLARI", "equity"],
  ["529", "DİĞER SERMAYE YEDEKLERİ", "equity"], ["540", "YASAL YEDEKLER", "equity"],
  ["541", "STATÜ YEDEKLERİ", "equity"], ["542", "OLAĞANÜSTÜ YEDEKLER", "equity"],
  ["548", "DİĞER KÂR YEDEKLERİ", "equity"], ["549", "ÖZEL FONLAR", "equity"],
  ["570", "GEÇMİŞ YILLAR KÂRLARI", "equity"], ["580", "GEÇMİŞ YILLAR ZARARLARI (-)", "equity"],
  ["590", "DÖNEM NET KÂRI", "equity"], ["591", "DÖNEM NET ZARARI (-)", "equity"],
  ["600", "YURTİÇİ SATIŞLAR", "income"], ["601", "YURTDIŞI SATIŞLAR", "income"], ["602", "DİĞER GELİRLER", "income"],
  ["610", "SATIŞTAN İADELER (-)", "expense"], ["611", "SATIŞ İSKONTOLARI (-)", "expense"],
  ["612", "DİĞER İNDİRİMLER (-)", "expense"], ["620", "SATILAN MAMULLER MALİYETİ (-)", "expense"],
  ["621", "SATILAN TİCARİ MALLAR MALİYETİ (-)", "expense"], ["622", "SATILAN HİZMET MALİYETİ (-)", "expense"],
  ["623", "DİĞER SATIŞLARIN MALİYETİ (-)", "expense"], ["630", "ARAŞTIRMA VE GELİŞTİRME GİDERLERİ (-)", "expense"],
  ["631", "PAZARLAMA, SATIŞ VE DAĞITIM GİDERLERİ (-)", "expense"], ["632", "GENEL YÖNETİM GİDERLERİ (-)", "expense"],
  ["640", "İŞTİRAKLERDEN TEMETTÜ GELİRLERİ", "income"], ["642", "FAİZ GELİRLERİ", "income"],
  ["644", "KONUSU KALMAYAN KARŞILIKLAR", "income"], ["646", "KAMBİYO KÂRLARI", "income"],
  ["649", "DİĞER OLAĞAN GELİR VE KÂRLAR", "income"], ["653", "KOMİSYON GİDERLERİ (-)", "expense"],
  ["654", "KARŞILIK GİDERLERİ (-)", "expense"], ["655", "MENKUL KIYMET SATIŞ ZARARLARI (-)", "expense"],
  ["656", "KAMBİYO ZARARLARI (-)", "expense"], ["657", "REESKONT FAİZ GİDERLERİ (-)", "expense"],
  ["659", "DİĞER OLAĞAN GİDER VE ZARARLAR (-)", "expense"], ["671", "ÖNCEKİ DÖNEM GELİR VE KÂRLARI", "income"],
  ["679", "DİĞER OLAĞANDIŞI GELİR VE KÂRLAR", "income"], ["680", "ÇALIŞMAYAN KISIM GİDER VE ZARARLARI (-)", "expense"],
  ["681", "ÖNCEKİ DÖNEM GİDER VE ZARARLARI (-)", "expense"], ["689", "DİĞER OLAĞANDIŞI GİDER VE ZARARLAR (-)", "expense"],
  ["690", "DÖNEM KÂRI VEYA ZARARI", "equity"], ["691", "DÖNEM KÂRI VERGİ VE DİĞER YASAL YÜKÜMLÜLÜK KARŞILIKLARI (-)", "expense"],
  ["692", "DÖNEM NET KÂRI VEYA ZARARI", "equity"],
  ["710", "DİREKT İLKMADDE VE MALZEME GİDERLERİ", "expense"], ["720", "DİREKT İŞÇİLİK GİDERLERİ", "expense"],
  ["730", "GENEL ÜRETİM GİDERLERİ", "expense"], ["740", "HİZMET ÜRETİM MALİYETİ", "expense"],
  ["750", "ARAŞTIRMA VE GELİŞTİRME GİDERLERİ", "expense"], ["760", "PAZARLAMA, SATIŞ VE DAĞITIM GİDERLERİ", "expense"],
  ["770", "GENEL YÖNETİM GİDERLERİ", "expense"], ["780", "FİNANSMAN GİDERLERİ", "expense"],
  ["900", "NAZIM HESAPLAR", "memo"], ["950", "KANUNEN KABUL EDİLMEYEN GİDERLER", "memo"],
];

export const defaultAccountingSettings = {
  currency: "TRY",
  fiscalYear: new Date().getFullYear(),
  accounts: {
    cash: "100", bank: "102", customers: "120", suppliers: "320", inventory: "153",
    inputVat: "191", outputVat: "391", domesticSales: "600", exportSales: "601",
    withholdingReceivable: "136", withholdingPayable: "360", salesReturns: "610", cogs: "621",
    generalExpense: "770", writeOff: "689", openingEquity: "500",
  },
};

const makeAccount = ([code, name, type]) => ({
  id: `std-${code}`,
  code,
  name,
  type,
  parentCode: null,
  level: 1,
  system: true,
  active: true,
});

export function normalizeAccountingStore(db) {
  db.accounting ??= {};
  db.accounting.settings = {
    ...defaultAccountingSettings,
    ...(db.accounting.settings ?? {}),
    accounts: { ...defaultAccountingSettings.accounts, ...(db.accounting.settings?.accounts ?? {}) },
  };
  const existing = Array.isArray(db.accounting.accounts) ? db.accounting.accounts : [];
  const byCode = new Map(existing.map((account) => [String(account.code), account]));
  for (const seed of seedAccounts.map(makeAccount)) if (!byCode.has(seed.code)) byCode.set(seed.code, seed);
  db.accounting.accounts = [...byCode.values()].sort((a, b) => String(a.code).localeCompare(String(b.code), "tr"));
  db.accounting.journals ??= [];
  db.accounting.periods ??= [{
    id: String(db.accounting.settings.fiscalYear),
    year: db.accounting.settings.fiscalYear,
    status: "open",
    openedAt: new Date().toISOString(),
  }];
  db.counterparties = (db.counterparties ?? []).map((counterparty) => ensureCounterpartyAccounting(db, counterparty));
  return db.accounting;
}

const currentPrefix = (kind) => kind === "supplier" ? "TED" : "MUS";
const currentParent = (kind) => kind === "supplier" ? "320" : "120";

export function ensureCounterpartyAccounting(db, counterparty) {
  const id = Number(counterparty.id) || 0;
  const suffix = String(id).padStart(5, "0");
  const kind = counterparty.kind === "supplier" ? "supplier" : "customer";
  const currentCode = counterparty.currentCode || `${currentPrefix(kind)}-${suffix}`;
  const accountingCode = counterparty.accountingCode || `${currentParent(kind)}.01.${suffix}`;
  const accountName = String(counterparty.name || currentCode).toLocaleUpperCase("tr-TR");
  const existingAccount = db.accounting.accounts.find((account) => account.code === accountingCode);
  if (existingAccount) {
    existingAccount.name = accountName;
    existingAccount.active = counterparty.status !== "Bloklu";
    existingAccount.counterpartyId = counterparty.id;
  } else {
    db.accounting.accounts.push({
      id: `counterparty-${counterparty.id}-${kind}`,
      code: accountingCode,
      name: accountName,
      type: kind === "supplier" ? "liability" : "asset",
      parentCode: currentParent(kind),
      level: 3,
      system: false,
      active: counterparty.status !== "Bloklu",
      counterpartyId: counterparty.id,
    });
  }
  return { ...counterparty, currentCode, accountingCode };
}

const amount = (value) => Math.round((Number(value) || 0) * 100) / 100;
const accountForMoney = (document, settings) => String(document.account ?? "").toLocaleLowerCase("tr-TR").includes("bank")
  ? settings.accounts.bank
  : settings.accounts.cash;

function counterpartyAccount(db, document, kind) {
  const counterparty = db.counterparties.find((item) => Number(item.id) === Number(document.counterpartyId));
  if (counterparty?.accountingCode) return counterparty.accountingCode;
  return kind === "supplier" ? db.accounting.settings.accounts.suppliers : db.accounting.settings.accounts.customers;
}

function documentCost(db, document) {
  return amount((document.lines ?? []).reduce((sum, line) => {
    const product = db.products.find((item) => Number(item.id) === Number(line.productId));
    return sum + (Number(line.qty) || 0) * (Number(line.cost ?? product?.cost) || 0);
  }, 0));
}

function postingLines(db, document) {
  const cfg = db.accounting.settings.accounts;
  const total = amount(document.total ?? document.amount);
  if (!total || document.posted === false || document.status === "draft") return [];
  const customer = counterpartyAccount(db, document, "customer");
  const supplier = counterpartyAccount(db, document, "supplier");
  const cash = accountForMoney(document, db.accounting.settings);
  const lines = [];
  const push = (accountCode, debit = 0, credit = 0, description = "") => lines.push({ accountCode, debit: amount(debit), credit: amount(credit), description });
  const tax = amount(document.taxTotal);
  const withholding = amount(document.withholdingTotal);
  const net = amount(document.taxExclusiveTotal ?? total - tax + withholding);
  if (document.type === "sale") {
    push(customer, total, 0, document.counterpartyName);
    if (withholding) push(cfg.withholdingReceivable, withholding, 0, "Alıcı tərəfindən tutulacaq KDV");
    push(document.saleMode === "export" || document.exportMode ? cfg.exportSales : cfg.domesticSales, 0, net, "Satış gəliri");
    if (tax) push(cfg.outputVat, 0, tax, "Hesablanan KDV");
    const cost = documentCost(db, document);
    if (cost) { push(cfg.cogs, cost, 0, "Satılan malın mayası"); push(cfg.inventory, 0, cost, "Stok çıxışı"); }
  } else if (document.type === "purchase") {
    push(cfg.inventory, net, 0, "Mal alışı");
    if (tax) push(cfg.inputVat, tax, 0, "İndiriləcək KDV");
    push(supplier, 0, total, document.counterpartyName);
    if (withholding) push(cfg.withholdingPayable, 0, withholding, "Məsul sifəti ilə ödənəcək KDV");
  } else if (document.type === "saleReturn") {
    push(cfg.salesReturns, net, 0, "Satış qaytarması");
    if (tax) push(cfg.outputVat, tax, 0, "Hesablanan KDV qaytarması");
    push(customer, 0, total, document.counterpartyName);
    if (withholding) push(cfg.withholdingReceivable, 0, withholding, "Tevkifat qaytarması");
  } else if (document.type === "purchaseReturn") {
    push(supplier, total, 0, document.counterpartyName);
    if (withholding) push(cfg.withholdingPayable, withholding, 0, "Tevkifat qaytarması");
    push(cfg.inventory, 0, net, "Alış qaytarması");
    if (tax) push(cfg.inputVat, 0, tax, "İndiriləcək KDV qaytarması");
  } else if (document.type === "cashIn") {
    push(cash, total, 0, "Pul girişi"); push(document.counterpartyId ? customer : "649", 0, total, document.counterpartyName || document.category);
  } else if (document.type === "cashOut") {
    push(document.counterpartyId ? supplier : cfg.generalExpense, total, 0, document.counterpartyName || document.category); push(cash, 0, total, "Pul çıxışı");
  } else if (document.type === "cashTransfer") {
    push(String(document.toAccount ?? "").toLocaleLowerCase("tr-TR").includes("bank") ? cfg.bank : cfg.cash, total, 0, "Hədəf hesab");
    push(cash, 0, total, "Mənbə hesab");
  } else if (document.type === "openingBalance") {
    push(cfg.inventory, total, 0, "Açılış stoku"); push(cfg.openingEquity, 0, total, "Açılış qarşılığı");
  } else if (document.type === "writeOff") {
    push(cfg.writeOff, total, 0, "Stok silinməsi"); push(cfg.inventory, 0, total, "Stok çıxışı");
  }
  return lines;
}

export function upsertDocumentJournal(db, document) {
  normalizeAccountingStore(db);
  db.accounting.journals = db.accounting.journals.filter((journal) => String(journal.sourceDocumentId) !== String(document.id));
  const lines = postingLines(db, document);
  if (!lines.length) return null;
  const debit = amount(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = amount(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debit !== credit) throw new Error(`Mühasibat fişi balanssızdır: ${debit} / ${credit}`);
  const journal = {
    id: randomUUID(),
    number: `YEV-${String(db.accounting.journals.length + 1).padStart(7, "0")}`,
    date: document.documentDate ?? document.createdAt ?? new Date().toISOString(),
    description: `${document.type} #${String(document.id).slice(0, 8)}`,
    sourceDocumentId: document.id,
    sourceType: document.type,
    status: "posted",
    currency: document.currency ?? db.accounting.settings.currency,
    lines,
    debit,
    credit,
    createdAt: new Date().toISOString(),
  };
  db.accounting.journals.unshift(journal);
  return journal;
}

export function accountingTrialBalance(db) {
  normalizeAccountingStore(db);
  const totals = new Map();
  for (const journal of db.accounting.journals) {
    if (journal.status !== "posted") continue;
    for (const line of journal.lines ?? []) {
      const current = totals.get(line.accountCode) ?? { debit: 0, credit: 0 };
      current.debit += Number(line.debit) || 0;
      current.credit += Number(line.credit) || 0;
      totals.set(line.accountCode, current);
    }
  }
  return db.accounting.accounts.map((account) => {
    const total = totals.get(account.code) ?? { debit: 0, credit: 0 };
    return { ...account, debit: amount(total.debit), credit: amount(total.credit), balance: amount(total.debit - total.credit) };
  }).filter((account) => account.debit || account.credit || account.level === 1);
}

export function accountingOverview(db) {
  const trial = accountingTrialBalance(db);
  return {
    accountCount: db.accounting.accounts.length,
    journalCount: db.accounting.journals.length,
    debit: amount(db.accounting.journals.reduce((sum, journal) => sum + Number(journal.debit || 0), 0)),
    credit: amount(db.accounting.journals.reduce((sum, journal) => sum + Number(journal.credit || 0), 0)),
    activePeriod: db.accounting.periods.find((period) => period.status === "open") ?? null,
    trial,
  };
}

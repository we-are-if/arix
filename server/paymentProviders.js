const capabilityLabels = {
  payment_links: "Ödeme linki",
  card_payments: "Kartla ödeme",
  installments: "Taksit",
  refunds: "İptal / iade",
  webhooks: "Webhook",
  erp_sync: "ERP / cari aktarımı",
  dealer_collection: "Bayi tahsilatı",
  reconciliation: "Mutabakat",
  routing: "Akıllı yönlendirme",
  recurring: "Tekrarlı ödeme",
  qr: "QR ödeme",
  softpos: "SoftPOS",
  open_banking: "Açık bankacılık",
};

const defaultCredentials = {
  collection_platform: ["merchantId", "apiKey", "secretKey", "webhookSecret"],
  orchestration: ["merchantId", "apiKey", "secretKey", "webhookSecret"],
  payment_institution: ["merchantId", "apiKey", "secretKey", "webhookSecret"],
  direct_bank: ["merchantId", "terminalId", "username", "password", "storeKey"],
};

const typeCapabilities = {
  collection_platform: ["payment_links", "card_payments", "installments", "refunds", "webhooks", "erp_sync", "dealer_collection", "reconciliation"],
  orchestration: ["payment_links", "card_payments", "installments", "refunds", "webhooks", "reconciliation", "routing"],
  payment_institution: ["payment_links", "card_payments", "installments", "refunds", "webhooks"],
  direct_bank: ["card_payments", "installments", "refunds"],
};

const definitions = [
  // Tahsilat, bayi ve ERP platformları
  ["tahsilapp", "TahsilApp", "collection_platform", "https://www.tahsilapp.com/"],
  ["netahsilat", "Netahsilat", "collection_platform", "https://finrota.com/netahsilat/"],
  ["oduyo", "Ödüyo", "collection_platform", "https://www.oduyo.com.tr/"],
  ["tahsilat-com", "Tahsilat.com", "collection_platform", "https://www.tahsilat.com/"],
  ["buluttahsil", "BulutTahsil", "collection_platform", "https://www.buluttahsil.com/"],
  ["payos-collect", "Payos Collect", "collection_platform", "https://payos.com.tr/tr/collect/"],
  ["payfoni", "Payfoni", "collection_platform", "https://payfoni.com.tr/"],
  ["odemeix", "Ödemeix", "collection_platform", "https://www.odemeix.com.tr/"],
  ["hizli-ode", "Hızlı Öde", "collection_platform", "https://hizliode.com.tr/"],
  ["parangelsin", "Parangelsin", "collection_platform", "https://parangelsin.com/"],
  ["pos724", "POS724", "collection_platform", "https://pos724.com/"],
  ["joi-pos", "JOİ POS", "collection_platform", "https://www.joisoft.com.tr/joi-pos.html"],
  ["tahsilet", "Tahsilet", "collection_platform", "https://isiksoft.com.tr/cozumler/tahsilet"],
  ["flexodeme", "FlexÖdeme", "collection_platform", "https://flexode.me/"],
  ["pgpara", "PGPARA", "collection_platform", "https://pgpara.com/"],
  ["odego", "Ödego", "collection_platform", "https://odego.com.tr/"],
  ["bakiyem", "Bakiyem", "collection_platform", "https://www.bakiyem.com/"],
  ["kivipay", "KiviPAY", "collection_platform", "https://www.kivierp.com.tr/kivipay"],
  ["odemepro", "ÖdemePro", "collection_platform", "https://odemepro.com/"],
  ["postahsil", "PosTahsil", "collection_platform", "https://www.postahsil.com/"],
  ["sanalpos-com", "SanalPos.com", "collection_platform", "https://www.sanalpos.com/"],
  ["logo-etahsilat", "Logo e-Tahsilat", "collection_platform", "https://www.logo.com.tr/urun/logo-e-tahsilat"],
  ["tbs-websell", "TBS Websell B2B", "collection_platform", "https://www.logo.com.tr/logo-ekosistem-cozumleri/tbs-websell-b2b-siparis-online-tahsilat"],
  ["protahsilat", "Protahsilat", "collection_platform", "https://www.proticaret.org/protahsilat-e-tahsilat-modulu"],
  ["b2bpro", "B2BPro", "collection_platform", "https://www.b2bpro.com.tr/"],
  ["mirab2b", "MiraB2B", "collection_platform", "https://mirab2b.com/tr/b2b-online-tahsilat"],
  ["nss-etahsilat", "NSS e-Tahsilat", "collection_platform", "https://nssyazilim.com/e-tahsilat"],
  ["yk-tahsilat", "YK Yazılım Tahsilat", "collection_platform", "https://www.ykyazilim.com.tr/tahsilat"],
  ["softoly-etahsilat", "Softoly e-Tahsilat", "collection_platform", "https://softoly.com/yazilim-cozumleri/e-tahsilat"],
  ["mentor-etahsilat", "Mentor e-Tahsilat", "collection_platform", "https://mentoryazilim.com.tr/urunler/e-tahsilat.html"],
  ["isim-her-yerde", "İşim Her Yerde", "collection_platform", "https://www.isimheryerde.com/"],
  ["engerek", "Engerek", "collection_platform", "https://engerek.com.tr/"],

  // Ödeme orkestrasyonu ve gateway katmanı
  ["craftgate", "Craftgate", "orchestration", "https://craftgate.io/"],
  ["treps", "Treps", "orchestration", "https://treps.tr/"],
  ["paywall", "Paywall", "orchestration", "https://paywall.one/"],
  ["finekstra", "Finekstra", "orchestration", "https://finekstra.com/"],
  ["payten", "Payten Payment Gateway", "orchestration", "https://www.payten.com/tr/"],
  ["payflex", "İnnova PayFlex", "orchestration", "https://www.innova.com.tr/payflex"],
  ["poyra", "Poyra", "orchestration", "https://poyra-docs.dakicksoft.com/tr/baslangic/giris"],
  ["odemehub", "ÖdemeHub", "orchestration", "https://gurmehub.com/blog/odemehub-odeme-orkestrasyonu/"],
  ["demirgate", "DemirGate", "orchestration", "https://www.demirgate.com.tr/"],
  ["paypartner", "Pay Partner", "orchestration", "https://paypartner.com.tr/"],
  ["posbasit", "PosBasit", "orchestration", "https://www.entegrabilisim.com/"],

  // TCMB lisanslı, üye işyeri entegrasyonu sunabilen başlıca kuruluş/markalar
  ["iyzico", "iyzico", "payment_institution", "https://www.iyzico.com/"],
  ["paytr", "PayTR", "payment_institution", "https://www.paytr.com/"],
  ["parampos", "ParamPOS", "payment_institution", "https://param.com.tr/"],
  ["sipay", "Sipay", "payment_institution", "https://sipay.com.tr/"],
  ["paratika", "Paratika", "payment_institution", "https://www.paratika.com.tr/"],
  ["moka-united", "Moka United", "payment_institution", "https://www.mokaunited.com/"],
  ["qnbpay", "QNBpay", "payment_institution", "https://www.qnbpay.com.tr/"],
  ["lidio", "Lidio", "payment_institution", "https://www.lidio.com/"],
  ["odeal", "Ödeal", "payment_institution", "https://odeal.com/"],
  ["paynkolay", "Pay N Kolay", "payment_institution", "https://www.paynkolay.com.tr/"],
  ["paycell", "Paycell", "payment_institution", "https://www.paycell.com.tr/"],
  ["ozan", "Ozan", "payment_institution", "https://ozan.com/"],
  ["tosla", "Tosla / Aköde", "payment_institution", "https://tosla.com/"],
  ["tami", "Tami", "payment_institution", "https://www.tami.com.tr/"],
  ["papara", "Papara", "payment_institution", "https://www.papara.com/"],
  ["elekse", "Elekse", "payment_institution", "https://www.elekse.com/"],
  ["octet", "Octet Express", "payment_institution", "https://www.octet.com.tr/"],
  ["token", "Token", "payment_institution", "https://www.tokeninc.com/"],

  // Doğrudan banka sanal POS'ları
  ["akbank", "Akbank Sanal POS", "direct_bank", "https://www.akbank.com/"],
  ["garanti", "Garanti BBVA Sanal POS", "direct_bank", "https://www.garantibbva.com.tr/"],
  ["isbank", "İş Bankası Sanal POS", "direct_bank", "https://www.isbank.com.tr/"],
  ["yapi-kredi", "Yapı Kredi POSNET", "direct_bank", "https://www.yapikredi.com.tr/"],
  ["ziraat", "Ziraat Bankası Sanal POS", "direct_bank", "https://www.ziraatbank.com.tr/"],
  ["vakifbank", "VakıfBank Sanal POS", "direct_bank", "https://www.vakifbank.com.tr/"],
  ["halkbank", "Halkbank Sanal POS", "direct_bank", "https://www.halkbank.com.tr/"],
  ["qnb", "QNB Sanal POS", "direct_bank", "https://www.qnb.com.tr/"],
  ["denizbank", "DenizBank Sanal POS", "direct_bank", "https://www.denizbank.com/"],
  ["teb", "TEB Sanal POS", "direct_bank", "https://www.teb.com.tr/"],
  ["ing", "ING Sanal POS", "direct_bank", "https://www.ing.com.tr/"],
  ["sekerbank", "Şekerbank Sanal POS", "direct_bank", "https://www.sekerbank.com.tr/"],
  ["alternatifbank", "Alternatif Bank Sanal POS", "direct_bank", "https://www.alternatifbank.com.tr/"],
  ["anadolubank", "Anadolubank Sanal POS", "direct_bank", "https://www.anadolubank.com.tr/"],
  ["fibabanka", "Fibabanka Sanal POS", "direct_bank", "https://www.fibabanka.com.tr/"],
  ["kuveyt-turk", "Kuveyt Türk Sanal POS", "direct_bank", "https://www.kuveytturk.com.tr/"],
  ["turkiye-finans", "Türkiye Finans Sanal POS", "direct_bank", "https://www.turkiyefinans.com.tr/"],
  ["albaraka", "Albaraka Türk Sanal POS", "direct_bank", "https://www.albaraka.com.tr/"],
  ["vakif-katilim", "Vakıf Katılım Sanal POS", "direct_bank", "https://www.vakifkatilim.com.tr/"],
  ["ziraat-katilim", "Ziraat Katılım Sanal POS", "direct_bank", "https://www.ziraatkatilim.com.tr/"],
  ["hsbc", "HSBC Sanal POS", "direct_bank", "https://www.hsbc.com.tr/"],
];

const legacyDefinitions = [
  ["paynet", "Paynet / PayPortal", "İyzico ile birleşti"],
  ["payu", "PayU Türkiye", "İyzico ile birleşti"],
  ["moka-legacy", "Moka", "Moka United yapısına geçti"],
  ["vepara", "Vepara", "TCMB faaliyet izni iptal edildi"],
  ["paybull", "PayBull", "TCMB faaliyet izni iptal edildi"],
  ["trpos", "TRPOS", "TCMB faaliyet izni iptal edildi"],
  ["aypara", "Aypara", "TCMB faaliyet izni iptal edildi"],
  ["vezne24", "Vezne24", "TCMB faaliyet izni iptal edildi"],
];

export const paymentProviderCatalog = [
  ...definitions.map(([id, name, type, website]) => ({
    id,
    name,
    type,
    website,
    country: "TR",
    availability: "active",
    integrationState: "catalog",
    capabilities: typeCapabilities[type],
    credentialFields: defaultCredentials[type],
  })),
  ...legacyDefinitions.map(([id, name, note]) => ({
    id,
    name,
    type: "legacy",
    website: "",
    country: "TR",
    availability: "legacy",
    integrationState: "unsupported",
    note,
    capabilities: [],
    credentialFields: [],
  })),
];

export function providerById(id) {
  return paymentProviderCatalog.find((provider) => provider.id === String(id ?? ""));
}

export function normalizeProviderConnections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && providerById(item.providerId))
    .map((item) => ({
      id: String(item.id),
      providerId: String(item.providerId),
      label: String(item.label || providerById(item.providerId)?.name || "Bağlantı"),
      environment: item.environment === "live" ? "live" : "test",
      status: ["configured", "disabled", "attention"].includes(item.status) ? item.status : "configured",
      credentialCipher: typeof item.credentialCipher === "string" ? item.credentialCipher : "",
      credentialKeys: Array.isArray(item.credentialKeys) ? item.credentialKeys.map(String) : [],
      webhookUrl: String(item.webhookUrl || ""),
      lastTestedAt: item.lastTestedAt || null,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
}

export function publicProviderConnection(connection) {
  const provider = providerById(connection.providerId);
  return {
    id: connection.id,
    providerId: connection.providerId,
    providerName: provider?.name ?? connection.providerId,
    providerType: provider?.type ?? "unknown",
    label: connection.label,
    environment: connection.environment,
    status: connection.status,
    credentialKeys: connection.credentialKeys,
    credentialsConfigured: Boolean(connection.credentialCipher && connection.credentialKeys.length),
    webhookUrl: connection.webhookUrl,
    lastTestedAt: connection.lastTestedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export function validateProviderConnectionInput(input) {
  const provider = providerById(input?.providerId);
  if (!provider || provider.availability !== "active") return { ok: false, error: "Aktif bir sağlayıcı seçin." };
  const label = String(input?.label ?? "").trim();
  if (!label) return { ok: false, error: "Bağlantı adı gereklidir." };
  const credentials = input?.credentials && typeof input.credentials === "object" ? input.credentials : {};
  const credentialKeys = Object.entries(credentials)
    .filter(([, value]) => String(value ?? "").trim())
    .map(([key]) => key);
  if (!credentialKeys.length) return { ok: false, error: "En az bir kimlik bilgisi girin." };
  return {
    ok: true,
    value: {
      provider,
      label,
      environment: input?.environment === "live" ? "live" : "test",
      credentials: Object.fromEntries(Object.entries(credentials).map(([key, value]) => [key, String(value ?? "").trim()])),
      credentialKeys,
      webhookUrl: String(input?.webhookUrl ?? "").trim(),
    },
  };
}

export { capabilityLabels };

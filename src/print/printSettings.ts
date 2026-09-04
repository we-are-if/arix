export type PrintFormKey =
  | "sale"
  | "orderConfirmation"
  | "proforma"
  | "commercial"
  | "packingList"
  | "purchase"
  | "movement"
  | "customs"
  | "inventory"
  | "writeOff"
  | "receipt"
  | "label";

export type PrintFormConfig = {
  title: string;
  subtitle: string;
  footerNote: string;
  footerInfo: string;
  showLogo: boolean;
  showMeta: boolean;
  showFooter: boolean;
};

export type PrintSettings = {
  companyName: string;
  brandSubtitle: string;
  companyLogo: string;
  forms: Record<PrintFormKey, PrintFormConfig>;
};

const form = (title: string, subtitle: string): PrintFormConfig => ({
  title,
  subtitle,
  footerNote: "",
  footerInfo: "",
  showLogo: true,
  showMeta: true,
  showFooter: true,
});

export const defaultPrintSettings: PrintSettings = {
  companyName: "AriX",
  brandSubtitle: "Sənəd sistemi",
  companyLogo: "",
  forms: {
    sale: form("Satış sənədi", "Məhsul və ödəniş məlumatları"),
    orderConfirmation: form("Sipariş onay formu", "Adi satışlar üçün müştəri təsdiq forması"),
    proforma: form("Proforma invoice", "İxracat satışları üçün ilkin invoice"),
    commercial: form("Commercial invoice", "Rəsmi ixrac invoice forması"),
    packingList: form("Packing list", "Palet, rulo və çəki siyahısı"),
    purchase: form("Alış sənədi", "Təchizatçıdan alınan məhsullar"),
    movement: form("Yerdəyişmə sənədi", "Mağazalar arasında stok hərəkəti"),
    customs: form("Antrepo düşüm", "Bəyannamə üzrə kap, MT, çəki, palet və rulo forması"),
    inventory: form("İnventar siyahısı", "Faktiki və sistem qalığının müqayisəsi"),
    writeOff: form("Silinmə aktı", "Stokdan silinən məhsullar"),
    receipt: form("Ödəniş qəbzi", "Ödəniş və kontragent məlumatları"),
    label: form("Məhsul etiketi", "Məhsul və barkod məlumatları"),
  },
};

export const mergePrintSettings = (value?: Partial<PrintSettings> | null): PrintSettings => ({
  ...defaultPrintSettings,
  ...(value ?? {}),
  forms: Object.fromEntries(
    (Object.keys(defaultPrintSettings.forms) as PrintFormKey[]).map((key) => [
      key,
      {
        ...defaultPrintSettings.forms[key],
        ...(value?.forms?.[key] ?? {}),
      },
    ])
  ) as Record<PrintFormKey, PrintFormConfig>,
});

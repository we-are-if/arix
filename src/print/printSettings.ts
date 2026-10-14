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
  | "label"
  | "eInvoice"
  | "eArchive"
  | "eDespatch"
  | "exportInvoice";

export type PrintFormConfig = {
  title: string;
  subtitle: string;
  footerNote: string;
  footerInfo: string;
  showLogo: boolean;
  showMeta: boolean;
  showFooter: boolean;
  showCompanyDetails: boolean;
  showBankAccounts: boolean;
  showNotes: boolean;
  showStamp: boolean;
  xmlTemplate: string;
};

export type PrintCompanyDetails = {
  title: string;
  taxNumber: string;
  taxOffice: string;
  country: string;
  address: string;
  city: string;
  district: string;
  postalCode: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  bankAccounts: Array<{ bank: string; currency: string; iban: string }>;
};

export type PrintSettings = {
  companyName: string;
  brandSubtitle: string;
  companyLogo: string;
  companyStamp: string;
  companyDetails: PrintCompanyDetails;
  forms: Record<PrintFormKey, PrintFormConfig>;
};

export const defaultPrintCompanyDetails: PrintCompanyDetails = {
  title: "",
  taxNumber: "",
  taxOffice: "",
  country: "TR",
  address: "",
  city: "",
  district: "",
  postalCode: "",
  phone: "",
  fax: "",
  email: "",
  website: "",
  bankAccounts: [],
};

export const invoiceXmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2 UBLTR-Invoice-2.1.xsd">
  {{EXTENSIONS}}
  {{COMMON}}
  {{TYPE_CODE}}
  {{NOTE}}
  {{CURRENCY}}
  {{LINE_COUNT}}
  {{RELATED_DOCUMENTS}}
  {{XSLT}}
  {{SIGNATURE}}
  {{SUPPLIER}}
  {{CUSTOMER}}
  {{PAYMENT_MEANS}}
  {{EXCHANGE_RATE}}
  {{TAX_TOTAL}}
  {{WITHHOLDING_TOTAL}}
  {{MONETARY_TOTAL}}
  {{LINES}}
</Invoice>`;

export const despatchXmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2 UBLTR-DespatchAdvice-2.1.xsd">
  {{EXTENSIONS}}
  {{COMMON}}
  {{TYPE_CODE}}
  {{NOTE}}
  {{LINE_COUNT}}
  {{RELATED_DOCUMENTS}}
  {{XSLT}}
  {{SIGNATURE}}
  {{SUPPLIER}}
  {{CUSTOMER}}
  {{SHIPMENT}}
  {{LINES}}
</DespatchAdvice>`;

const form = (title: string, subtitle: string, xmlTemplate = ""): PrintFormConfig => ({
  title,
  subtitle,
  footerNote: "",
  footerInfo: "",
  showLogo: true,
  showMeta: true,
  showFooter: true,
  showCompanyDetails: true,
  showBankAccounts: true,
  showNotes: true,
  showStamp: true,
  xmlTemplate,
});

export const defaultPrintSettings: PrintSettings = {
  companyName: "AriX",
  brandSubtitle: "Sənəd sistemi",
  companyLogo: "",
  companyStamp: "",
  companyDetails: defaultPrintCompanyDetails,
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
    eInvoice: form("e-FATURA", "TEMELFATURA ssenarisi", invoiceXmlTemplate),
    eArchive: form("e-ARŞİV FATURA", "EARSIVFATURA ssenarisi", invoiceXmlTemplate),
    eDespatch: form("e-İRSALİYE", "TEMELIRSALIYE ssenarisi", despatchXmlTemplate),
    exportInvoice: form("e-FATURA", "IHRACAT ssenarisi", invoiceXmlTemplate),
  },
};

export const mergePrintSettings = (
  value?: Partial<PrintSettings> | null,
  officialCompany?: Partial<PrintCompanyDetails> | null
): PrintSettings => ({
  ...defaultPrintSettings,
  ...(value ?? {}),
  companyDetails: {
    ...defaultPrintCompanyDetails,
    ...(value?.companyDetails ?? {}),
    ...(officialCompany ?? {}),
  },
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

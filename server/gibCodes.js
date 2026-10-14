export const gibCodeListVersion = "UBL-TR 1.2.1 Kod Listeleri v1.43 (27.07.2026)";

export const invoiceTypeCodes = [
  ["SATIS", "Satış"],
  ["IADE", "İade"],
  ["TEVKIFAT", "Tevkifat"],
  ["TEVKIFATIADE", "Tevkifat iadesi"],
  ["ISTISNA", "KDV istisnası"],
  ["OZELMATRAH", "Özel matrah"],
  ["IHRACKAYITLI", "İhraç kayıtlı satış"],
  ["SGK", "SGK"],
  ["KOMISYONCU", "Hal kayıt sistemi"],
  ["KONAKLAMAVERGISI", "Konaklama vergisi"],
  ["SARJANLIK", "Anlık şarj"],
  ["SARJ", "Haftalık şarj"],
  ["TEKNOLOJIDESTEK", "Teknolojik cihaz desteği"],
  ["YTBSATIS", "Yatırım teşvik satışı"],
  ["YTBISTISNA", "Yatırım teşvik istisnası"],
  ["YTBIADE", "Yatırım teşvik iadesi"],
  ["YTBTEVKIFAT", "Yatırım teşvik tevkifatı"],
  ["YTBTEVKIFATIADE", "Yatırım teşvik tevkifat iadesi"],
].map(([code, name]) => ({ code, name }));

const partialExemptions = [
  ["201", "17/1 Kültür ve eğitim amacı taşıyan işlemler"],
  ["202", "17/2-a Sağlık, çevre ve sosyal yardım amaçlı işlemler"],
  ["204", "17/2-c Diplomatik organ ve hayır kurumlarının bağış alımları"],
  ["205", "17/2-d Taşınmaz kültür varlıklarına ilişkin teslim ve mimarlık hizmetleri"],
  ["206", "17/2-e Mesleki kuruluşların işlemleri"],
  ["207", "17/3 Askeri fabrika, tersane ve atölyelerin işlemleri"],
  ["208", "17/4-c Birleşme, devir, dönüşüm ve bölünme işlemleri"],
  ["209", "17/4-e BSMV kapsamına giren işlemler"],
  ["211", "17/4-h Zirai amaçlı su ve köy içme suyu teslimleri"],
  ["212", "17/4-ı Serbest bölgelerde verilen hizmetler"],
  ["213", "17/4-j Boru hattı ile petrol ve gaz taşımacılığı"],
  ["214", "17/4-k OSB arsa/işyeri ve yapı kooperatifi konut teslimleri"],
  ["215", "17/4-l Varlık yönetim şirketlerinin işlemleri"],
  ["216", "17/4-m TMSF işlemleri"],
  ["217", "17/4-n Haber hizmetleri"],
  ["218", "17/4-o Gümrüklü sahalardaki bağımsız birimlerin kiralanması"],
  ["219", "Hazine, TOKİ ve yerel idarelerin işlemleri"],
  ["220", "17/4-r İki tam yıl elde tutulan iştirak hissesi ve belirli taşınmaz satışları"],
  ["221", "Geçici 15 İnşaat taahhüt hizmeti"],
  ["223", "Geçici 20/1 Teknoloji geliştirme bölgesi işlemleri"],
  ["225", "Geçici 23 MEB bilgisayar bağışları"],
  ["226", "17/2-b Bedelsiz eğitim ve öğretim hizmetleri"],
  ["227", "17/2-b Kanuni zorunlulukla bedelsiz teslim ve hizmetler"],
  ["228", "17/2-b Belirli kurumlara bedelsiz teslimler"],
  ["229", "Gıda bankacılığı kapsamındaki bağışlar"],
  ["230", "17/4-g Külçe altın, gümüş ve kıymetli taş teslimi"],
  ["231", "17/4-g Hurda ve atık teslimleri"],
  ["232", "17/4-g Döviz, para, damga pulu ve menkul kıymet teslimleri"],
  ["233", "Kamulaştırma Kanunu kapsamındaki taşınmaz devirleri"],
  ["234", "17/4-ş Konut finansmanı teminatındaki konutların teslimi"],
  ["235", "16/1-c Transit, antrepo, geçici depolama ve serbest bölge malları"],
  ["236", "19/2 Uluslararası anlaşma kapsamındaki iadesiz istisnalar"],
  ["237", "17/4-t Ürün senetlerinin ilk teslim sonrası borsa teslimleri"],
  ["238", "17/4-u Varlık kiralama şirketi işlemleri"],
  ["239", "17/4-y Finansal kiralama taşınmaz devirleri"],
  ["240", "17/4-z Patentli buluşlara ilişkin gayrimaddi haklar"],
  ["241", "TürkAkım anlaşması 9/b kapsamındaki hizmetler"],
  ["242", "17/4-ö Gümrüklü sahalarda ardiye, depolama ve terminal hizmetleri"],
  ["250", "Kısmi istisna - Diğerleri"],
];

const fullExemptions = [
  ["301", "11/1-a Mal ihracatı"],
  ["302", "11/1-a Hizmet ihracatı"],
  ["303", "11/1-a Roaming hizmetleri"],
  ["304", "13/a Deniz, hava ve demiryolu araçları teslim ve hizmetleri"],
  ["305", "13/b Liman ve hava meydanı hizmetleri"],
  ["306", "13/c Petrol arama ve boru hattı teslim/hizmetleri"],
  ["307", "13/c Maden arama ve rafinaj teslim/hizmetleri"],
  ["308", "13/d Teşvikli yatırım mallarının teslimi"],
  ["309", "13/e Liman ve hava meydanı inşa/yeni̇leme hizmetleri"],
  ["310", "13/f Ulusal güvenlik amaçlı teslim ve hizmetler"],
  ["311", "14/1 Uluslararası taşımacılık"],
  ["312", "15/a Diplomatik organ ve misyonlara teslim/hizmet"],
  ["313", "15/b Uluslararası kuruluşlara teslim/hizmet"],
  ["314", "19/2 Uluslararası anlaşma kapsamındaki istisnalar"],
  ["315", "14/3 İhraç eşyası taşıyan araçlara motorin teslimi"],
  ["316", "11/1-a Serbest bölge müşterileri için fason hizmet"],
  ["317", "17/4-s Engellilere ilişkin araç-gereç ve yazılım"],
  ["318", "Geçici 29 Yap-İşlet-Devret ve kiralama karşılığı tesis projeleri"],
  ["319", "13/g Başbakanlık merkez teşkilatına araç teslimi"],
  ["320", "Geçici 16 İSMEP teslim ve hizmetleri"],
  ["321", "Geçici 26 BM, NATO ve OECD kapsamındaki teslim/hizmet"],
  ["322", "11/1-a Bavul ticareti"],
  ["323", "13/ğ Ürün senetlerinin borsa aracılığıyla ilk teslimi"],
  ["324", "13/h Türkiye Kızılay Derneği teslim ve hizmetleri"],
  ["325", "13/ı Yem teslimleri"],
  ["326", "13/ı Tescilli gübre teslimleri"],
  ["327", "13/ı Gübre hammaddelerinin üreticiye teslimi"],
  ["328", "13/i Konut veya işyeri teslimleri"],
  ["329", "FATİH projesi teslim ve hizmetleri"],
  ["330", "13/j OSB ve küçük sanayi sitesi inşasına ilişkin teslim/hizmet"],
  ["331", "13/m Ar-Ge, yenilik ve tasarım için yeni makine/teçhizat"],
  ["332", "Geçici 39 İmalat sanayii için yeni makine/teçhizat"],
  ["333", "13/k Kamuya bağışlanan tesislerin inşası"],
  ["334", "13/l Yabancılara verilen sağlık hizmetleri"],
  ["335", "13/n Basılı kitap ve süreli yayın teslimleri"],
  ["336", "Geçici 46 UEFA müsabakaları teslim ve hizmetleri"],
  ["337", "TürkAkım anlaşması 9/h gaz taşıma hizmetleri"],
  ["338", "İmalatçıların mal ihracatları"],
  ["339", "Yatırım teşvik kapsamındaki inşaat teslim ve hizmetleri"],
  ["340", "Elektrik motorlu taşıt geliştirme mühendislik hizmetleri"],
  ["341", "Afetzedelere bağışlanacak konutların inşası"],
  ["342", "Kamuya bağışlanacak taşınmazların inşası"],
  ["343", "Bağış konutlarının yabancı devlet kurumlarına teslimi"],
  ["344", "13/o Milli savunma ve iç güvenlik için taşıt teslimi"],
  ["350", "Tam istisna - Diğerleri"],
  ["351", "İstisna olmayan diğer sıfır KDV işlemleri"],
  ["555", "KDV oran kontrolüne tabi olmayan satışlar"],
];

const specialReasons = [
  ["701", "11/1-c İhraç kayıtlı satış"],
  ["702", "DİİB ve geçici kabul rejimi kapsamındaki satış"],
  ["703", "ÖTV 8/2 kapsamındaki ihraç kayıtlı satış"],
  ["704", "KDV 11/1-c ve ÖTV 8/2 kapsamındaki ihraç kayıtlı satış"],
  ["801", "Özel matrah - Milli Piyango, Spor Toto vb."],
  ["802", "Özel matrah - At yarışları ve müşterek bahis"],
  ["803", "Özel matrah - Gösteri, konser ve sportif faaliyetler"],
  ["804", "Özel matrah - Gümrük deposu ve müzayede satışları"],
  ["805", "Özel matrah - Altın ziynet eşyası ve sikke altın"],
  ["806", "Özel matrah - Tütün mamulleri"],
  ["807", "Özel matrah - Muzır neşriyat"],
  ["808", "Özel matrah - Gümüş ziynet eşyası ve sikke gümüş"],
  ["809", "Özel matrah - Şehir içi ulaşım bileti/kartı bayi satışı"],
  ["810", "Özel matrah - Ön ödemeli elektronik haberleşme"],
  ["811", "Özel matrah - Plaka ve sürücü kursu evrakı"],
  ["812", "Özel matrah - İkinci el taşıt veya taşınmaz teslimi"],
];

export const taxExemptionCodes = [
  ...partialExemptions.map(([code, name]) => ({ code, name, group: "partial" })),
  ...fullExemptions.map(([code, name]) => ({ code, name, group: "full" })),
  ...specialReasons.map(([code, name]) => ({ code, name, group: Number(code) >= 800 ? "special-base" : "export-registered" })),
];

const withholdingSource = [
  ["601", "Yapım işleri ile mühendislik-mimarlık ve etüt-proje", 40],
  ["602", "Etüt, plan-proje, danışmanlık ve denetim", 90],
  ["603", "Makine, teçhizat, demirbaş ve taşıt tadil/bakım/onarım", 70],
  ["604", "Yemek servis hizmeti", 50], ["605", "Organizasyon hizmeti", 50],
  ["606", "İşgücü temin hizmeti", 90], ["607", "Özel güvenlik hizmeti", 90],
  ["608", "Yapı denetim hizmeti", 90], ["609", "Fason tekstil ve konfeksiyon işleri", 70],
  ["610", "Turistik mağaza müşteri bulma/götürme", 90], ["611", "Spor kulübü yayın, reklam ve isim hakkı", 90],
  ["612", "Temizlik hizmeti", 90], ["613", "Çevre ve bahçe bakım hizmeti", 90],
  ["614", "Servis taşımacılığı", 50], ["615", "Baskı ve basım hizmeti", 70],
  ["616", "Diğer hizmetler", 50], ["617", "Hurda metalden külçe teslimi", 70],
  ["618", "Bakır, çinko, demir-çelik, alüminyum ve kurşun külçe", 70],
  ["619", "Bakır, çinko ve alüminyum ürünleri", 70], ["620", "İstisnadan vazgeçilen hurda/atık", 70],
  ["621", "Hurda ve atıktan elde edilen hammadde", 90], ["622", "Pamuk, tiftik, yün, yapağı, ham post ve deri", 90],
  ["623", "Ağaç ve orman ürünleri", 50], ["624", "Yük taşımacılığı", 20],
  ["625", "Ticari reklam hizmeti", 30], ["626", "Diğer teslimler", 20], ["627", "Demir-çelik ürünleri", 50],
  ["801", "Tam tevkifat - Yapım işleri", 100], ["802", "Tam tevkifat - Etüt, proje ve danışmanlık", 100],
  ["803", "Tam tevkifat - Tadil, bakım ve onarım", 100], ["804", "Tam tevkifat - Yemek servisi", 100],
  ["805", "Tam tevkifat - Organizasyon", 100], ["806", "Tam tevkifat - İşgücü temini", 100],
  ["807", "Tam tevkifat - Özel güvenlik", 100], ["808", "Tam tevkifat - Yapı denetimi", 100],
  ["809", "Tam tevkifat - Fason tekstil", 100], ["810", "Tam tevkifat - Turistik mağaza hizmeti", 100],
  ["811", "Tam tevkifat - Spor kulübü işlemleri", 100], ["812", "Tam tevkifat - Temizlik", 100],
  ["813", "Tam tevkifat - Çevre ve bahçe bakımı", 100], ["814", "Tam tevkifat - Servis taşımacılığı", 100],
  ["815", "Tam tevkifat - Baskı ve basım", 100], ["816", "Tam tevkifat - Hurda metal külçe", 100],
  ["817", "Tam tevkifat - Diğer metal külçeler", 100], ["818", "Tam tevkifat - Metal ürünleri", 100],
  ["819", "Tam tevkifat - Hurda ve atık", 100], ["820", "Tam tevkifat - Hurda hammaddesi", 100],
  ["821", "Tam tevkifat - Pamuk, yün, post ve deri", 100], ["822", "Tam tevkifat - Ağaç ve orman ürünleri", 100],
  ["823", "Tam tevkifat - Yük taşımacılığı", 100], ["824", "Tam tevkifat - Ticari reklam", 100],
  ["825", "Tam tevkifat - Demir-çelik ürünleri", 100],
];

export const withholdingCodes = withholdingSource.map(([code, name, rate]) => ({ code, name, rate }));

export const packageTypeCodes = [
  ["BA", "Varil"], ["BE", "Bohça"], ["BG", "Torba"], ["BH", "Demet"], ["BI", "Çöp kutusu"],
  ["BJ", "Kova"], ["BK", "Sepet"], ["BX", "Kutu"], ["CB", "Bira kasası"], ["CH", "Sandık"],
  ["CI", "Teneke kutu"], ["CK", "Fıçı"], ["CN", "Konteyner"], ["CR", "Kasa"], ["DK", "Karton kasa"],
  ["DR", "Bidon"], ["EC", "Plastik torba"], ["FC", "Meyve kasası"], ["JR", "Kavanoz"], ["LV", "Liftvan"],
  ["NE", "Ambalajsız"], ["SA", "Çuval"], ["SU", "Bavul"], ["TN", "Teneke"], ["VG", "Dökme gaz"],
  ["VL", "Dökme sıvı"], ["VO", "Dökme katı"],
].map(([code, name]) => ({ code, name }));

export const transportModeCodes = [
  ["1", "Denizyolu"], ["2", "Demiryolu"], ["3", "Karayolu"], ["4", "Havayolu"],
  ["5", "Posta"], ["6", "Çok araçlı"], ["7", "Sabit taşıma tesisleri"], ["8", "İç su taşımacılığı"],
].map(([code, name]) => ({ code, name }));

export const incotermCodes = [
  ["CFR", "Masraflar ve navlun"], ["CIF", "Masraflar, sigorta ve navlun"],
  ["CIP", "Taşıma ve sigorta ödenmiş"], ["CPT", "Taşıma ödenmiş"],
  ["DAF", "Sınırda teslim"], ["DAP", "Belirlenen yerde teslim"], ["DPU", "Belirlenen yerde boşaltılmış teslim"],
  ["DDP", "Gümrük vergileri ödenmiş teslim"], ["DDU", "Gümrük resmi ödenmemiş teslim"],
  ["DEQ", "Rıhtımda teslim"], ["DES", "Gemide teslim"], ["EXW", "İşyerinde teslim"],
  ["FAS", "Gemi doğrultusunda masrafsız"], ["FCA", "Taşıyıcıya masrafsız"], ["FOB", "Gemide masrafsız"],
].map(([code, name]) => ({ code, name }));

const codeSet = (items) => new Set(items.map((item) => item.code));
export const invoiceTypeCodeSet = codeSet(invoiceTypeCodes);
export const taxExemptionCodeSet = codeSet(taxExemptionCodes);
export const withholdingCodeSet = codeSet(withholdingCodes);
export const packageTypeCodeSet = codeSet(packageTypeCodes);
export const transportModeCodeSet = codeSet(transportModeCodes);
export const incotermCodeSet = codeSet(incotermCodes);

export function gibCodeCatalog() {
  return {
    version: gibCodeListVersion,
    invoiceTypes: invoiceTypeCodes,
    taxExemptions: taxExemptionCodes,
    withholdings: withholdingCodes,
    packageTypes: packageTypeCodes,
    transportModes: transportModeCodes,
    incoterms: incotermCodes,
  };
}

export function findTaxExemption(code) {
  return taxExemptionCodes.find((item) => item.code === String(code ?? "")) ?? null;
}

export function findWithholding(code) {
  return withholdingCodes.find((item) => item.code === String(code ?? "")) ?? null;
}

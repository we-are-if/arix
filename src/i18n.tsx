import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLanguage = "az" | "tr" | "en" | "ru";
export type Translate = (key: string, fallback?: string) => string;

export const languageOptions: Array<{ id: AppLanguage; short: string; label: string; locale: string }> = [
  { id: "az", short: "AZ", label: "Azərbaycan", locale: "az-Latn-AZ" },
  { id: "tr", short: "TR", label: "Türkçe", locale: "tr-TR" },
  { id: "en", short: "EN", label: "English", locale: "en-US" },
  { id: "ru", short: "RU", label: "Русский", locale: "ru-RU" },
];

const monthNames: Record<AppLanguage, string[]> = {
  az: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"],
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};

export function formatAppDate(value: Date, language: AppLanguage) {
  const day = value.getDate();
  const month = monthNames[language][value.getMonth()];
  const year = value.getFullYear();
  if (language === "en") return `${month} ${day}, ${year}`;
  if (language === "ru") return `${day} ${month} ${year} г.`;
  return `${day} ${month} ${year}`;
}

const dictionaries: Record<AppLanguage, Record<string, string>> = {
  az: {
    "nav.home": "Ana səhifə",
    "nav.products": "Məhsullar və xidmətlər",
    "nav.productActivity": "Məhsul fəaliyyəti",
    "nav.moneyActivity": "Pul fəaliyyəti",
    "nav.onlineCollections": "Onlayn ödənişlər",
    "nav.counterparties": "Kontragentlər",
    "nav.suppliers": "Təchizatçılar",
    "nav.customers": "Müştərilər",
    "nav.company": "Şirkət",
    "nav.settings": "Parametrlər",
    "nav.employees": "Əməkdaşlar",
    "nav.stores": "Mağazalar",
    "nav.accounts": "Hesablar",
    "nav.loyalty": "Sadiqlik",
    "nav.printForms": "Çap formaları",
    "nav.cashShifts": "Kassa və növbələr",
    "nav.financeActivity": "Maliyyə fəaliyyəti",
    "nav.reports": "Hesabatlar",
    "collections.posManagement": "POS idarəetməsi",
    "collections.allPos": "POS və routing",
    "collections.paramPos": "Param POS",
    "collections.commissions": "POS və komissiya",
    "collections.paymentAi": "Ödəniş AI",
    "collections.operations": "Əməliyyatlar",
    "collections.operationDetails": "Əməliyyat detalları",
    "collections.paymentLinks": "Ödəniş linkləri",
    "collections.mailSms": "Mail və SMS izləmə",
    "collections.notifications": "Bildiriş mail və SMS",
    "collections.cards": "Kart siyahısı",
    "collections.dealerPos": "Bayi POS idarəetməsi",
    "collections.customersDealers": "Müştərilər və bayilər",
    "collections.newCollection": "Yeni ödəniş",
    "collections.reportGroup": "Hesabatlar",
    "collections.graphicReports": "Qrafik hesabatlar",
    "collections.generalReports": "Ümumi hesabatlar",
    "collections.currentAccountOps": "Cari hesab əməliyyatları",
    "collections.accountDebt": "Hesablar və borclandırma",
    "collections.accountMovements": "Hesab hərəkətləri",
    "collections.parameters": "Parametrlər",
    "collections.payment": "Parametrlər",
    "collections.contracts": "Müqavilələr",
    "collections.currentAccounts": "Cari hesablar",
    "collections.general": "Ümumi",
    "collections.ntLogin": "NT Login parametrləri",
    "collections.cardSettings": "Kart ayarları",
    "collections.definitions": "Təriflər",
    "collections.dynamicFields": "Dinamik sahələr",
    "collections.paymentItems": "Ödəniş maddələri",
    "collections.binFilters": "BIN filtrləri",
    "collections.binTable": "BIN cədvəli",
    "collections.paymentPages": "Ödəniş səhifələri",
    "collections.reconciliation": "Üzləşdirmə",
    "collections.webhookLogs": "Webhook logları",
    "nav.stock": "Stok",
    "nav.money": "Pul",
    "action.createDocument": "Sənəd yarat",
    "action.create": "Yarat",
    "action.logout": "Çıxış",
    "action.collapse": "Kiçilt",
    "action.expandSidebar": "Sidebarı genişləndir",
    "action.collapseSidebar": "Sidebarı kiçilt",
    "action.openMenu": "Menyunu aç",
    "action.closeMenu": "Menyunu bağla",
    "action.export": "İxrac",
    "action.close": "Bağla",
    "action.edit": "Redaktə",
    "action.print": "Çap et",
    "action.delete": "Sil",
    "action.filters": "Filtrlər",
    "action.addCondition": "Şərt əlavə et",
    "action.clearFilters": "Filtrləri təmizlə",
    "action.select": "Seç",
    "action.remove": "Sil",
    "language.select": "Dil seçimi",
    "theme.toggle": "Tema keçidi",
    "login.employee": "Əməkdaş girişi",
    "login.email": "E-poçt",
    "login.password": "Şifrə",
    "login.passwordPlaceholder": "Şifrənizi daxil edin",
    "login.submit": "Daxil ol",
    "login.demo": "Demo rejimində şifrə yoxlanmır.",
    "footer.demo": "AriX · Demo məqsədi ilə hazırlanmışdır — React · Tailwind · Recharts",
    "money.search": "axtarış...",
    "money.income": "Mədaxil",
    "money.expense": "Məxaric",
    "money.transfer": "Transfer",
    "money.refund": "Qaytarma",
    "money.balance": "Balans",
    "money.operationsShown": "əməliyyat göstərilir",
    "money.noneFound": "Heç nə tapılmadı.",
    "money.noCounterparty": "Kontragent yoxdur",
    "money.landedCostLinked": "Maya bağlı",
    "money.status.approved": "Təsdiqlənib",
    "money.status.preparing": "Hazırlanır",
    "money.status.cancelled": "Ləğv edilib",
    "money.column.status": "STATUS",
    "money.column.document": "SƏNƏD",
    "money.column.dateTime": "TARİX / SAAT",
    "money.column.account": "HESAB",
    "money.column.counterparty": "KONTRAGENT",
    "money.column.category": "KATEQORİYA",
    "money.column.linkedDocument": "BAĞLI SƏNƏD",
    "money.column.method": "ÜSUL",
    "money.column.amount": "MƏBLƏĞ",
    "money.column.author": "MÜƏLLİF",
    "money.filter.title": "Şərt filtri",
    "money.filter.description": "Pul əməliyyatını hesab, kontragent və üsula görə daralt.",
    "money.filter.allAdded": "Bütün şərtlər əlavə olunub",
    "money.filter.empty": "Şərt əlavə etdikcə burada kompakt sətirlər açılacaq.",
    "money.filter.instant": "Şərtlər cədvələ dərhal tətbiq olunur",
    "money.filter.date": "Tarix",
    "money.filter.status": "Status",
    "money.filter.kind": "Tip",
    "money.filter.account": "Hesab",
    "money.filter.counterparty": "Kontragent",
    "money.filter.author": "Müəllif",
    "money.filter.method": "Ödəniş üsulu",
    "money.filter.category": "Kateqoriya",
    "money.filter.equals": "bərabərdir",
    "money.filter.includes": "daxildir",
    "money.filter.choose": "Seçim edin",
  },
  tr: {
    "nav.home": "Ana sayfa",
    "nav.products": "Ürünler ve hizmetler",
    "nav.productActivity": "Ürün hareketleri",
    "nav.moneyActivity": "Para hareketleri",
    "nav.onlineCollections": "Online tahsilat",
    "nav.counterparties": "Cari hesaplar",
    "nav.suppliers": "Tedarikçiler",
    "nav.customers": "Müşteriler",
    "nav.company": "Şirket",
    "nav.settings": "Ayarlar",
    "nav.employees": "Çalışanlar",
    "nav.stores": "Mağazalar",
    "nav.accounts": "Hesaplar",
    "nav.loyalty": "Sadakat",
    "nav.printForms": "Yazdırma formları",
    "nav.cashShifts": "Kasa ve vardiyalar",
    "nav.financeActivity": "Finans hareketleri",
    "nav.reports": "Raporlar",
    "collections.posManagement": "POS yönetimi",
    "collections.allPos": "POS ve yönlendirme",
    "collections.paramPos": "Param POS",
    "collections.commissions": "POS ve komisyon",
    "collections.paymentAi": "Ödeme AI",
    "collections.operations": "İşlemler",
    "collections.operationDetails": "İşlem detayları",
    "collections.paymentLinks": "Ödeme linkleri",
    "collections.mailSms": "Mail SMS takibi",
    "collections.notifications": "Bilgilendirme mail ve SMS",
    "collections.cards": "Kart listesi",
    "collections.dealerPos": "Bayi POS yönetimi",
    "collections.customersDealers": "Müşteriler ve bayiler",
    "collections.newCollection": "Yeni tahsilat",
    "collections.reportGroup": "Raporlar",
    "collections.graphicReports": "Grafik raporlar",
    "collections.generalReports": "Genel raporlar",
    "collections.currentAccountOps": "Cari hesap işlemleri",
    "collections.accountDebt": "Hesaplar ve borçlandırma",
    "collections.accountMovements": "Hesap hareketleri",
    "collections.parameters": "Parametreler",
    "collections.payment": "Parametreler",
    "collections.contracts": "Sözleşmeler",
    "collections.currentAccounts": "Cari hesaplar",
    "collections.general": "Genel",
    "collections.ntLogin": "NT Login parametreleri",
    "collections.cardSettings": "Kart ayarları",
    "collections.definitions": "Tanımlar",
    "collections.dynamicFields": "Dinamik alanlar",
    "collections.paymentItems": "Ödeme kalemleri",
    "collections.binFilters": "BIN filtreleri",
    "collections.binTable": "BIN tablosu",
    "collections.paymentPages": "Ödeme sayfaları",
    "collections.reconciliation": "Mutabakat",
    "collections.webhookLogs": "Webhook logları",
    "nav.stock": "Stok",
    "nav.money": "Para",
    "action.createDocument": "Belge oluştur",
    "action.create": "Oluştur",
    "action.logout": "Çıkış",
    "action.collapse": "Daralt",
    "action.expandSidebar": "Kenar çubuğunu genişlet",
    "action.collapseSidebar": "Kenar çubuğunu daralt",
    "action.openMenu": "Menüyü aç",
    "action.closeMenu": "Menüyü kapat",
    "action.export": "Dışa aktar",
    "action.close": "Kapat",
    "action.edit": "Düzenle",
    "action.print": "Yazdır",
    "action.delete": "Sil",
    "action.filters": "Filtreler",
    "action.addCondition": "Koşul ekle",
    "action.clearFilters": "Filtreleri temizle",
    "action.select": "Seç",
    "action.remove": "Sil",
    "language.select": "Dil seçimi",
    "theme.toggle": "Tema değiştir",
    "login.employee": "Çalışan girişi",
    "login.email": "E-posta",
    "login.password": "Şifre",
    "login.passwordPlaceholder": "Şifrenizi girin",
    "login.submit": "Giriş yap",
    "login.demo": "Demo modunda şifre kontrol edilmez.",
    "footer.demo": "AriX · Demo amacıyla hazırlanmıştır — React · Tailwind · Recharts",
    "money.search": "ara...",
    "money.income": "Tahsilat",
    "money.expense": "Ödeme",
    "money.transfer": "Transfer",
    "money.refund": "İade",
    "money.balance": "Bakiye",
    "money.operationsShown": "işlem gösteriliyor",
    "money.noneFound": "Sonuç bulunamadı.",
    "money.noCounterparty": "Cari hesap yok",
    "money.landedCostLinked": "Maliyete bağlı",
    "money.status.approved": "Onaylandı",
    "money.status.preparing": "Hazırlanıyor",
    "money.status.cancelled": "İptal edildi",
    "money.column.status": "DURUM",
    "money.column.document": "BELGE",
    "money.column.dateTime": "TARİH / SAAT",
    "money.column.account": "HESAP",
    "money.column.counterparty": "CARİ HESAP",
    "money.column.category": "KATEGORİ",
    "money.column.linkedDocument": "BAĞLI BELGE",
    "money.column.method": "YÖNTEM",
    "money.column.amount": "TUTAR",
    "money.column.author": "OLUŞTURAN",
    "money.filter.title": "Koşul filtresi",
    "money.filter.description": "Para işlemlerini hesap, cari hesap ve yönteme göre daralt.",
    "money.filter.allAdded": "Tüm koşullar eklendi",
    "money.filter.empty": "Koşul eklediğinizde burada kompakt satırlar açılır.",
    "money.filter.instant": "Koşullar tabloya anında uygulanır",
    "money.filter.date": "Tarih",
    "money.filter.status": "Durum",
    "money.filter.kind": "Tür",
    "money.filter.account": "Hesap",
    "money.filter.counterparty": "Cari hesap",
    "money.filter.author": "Oluşturan",
    "money.filter.method": "Ödeme yöntemi",
    "money.filter.category": "Kategori",
    "money.filter.equals": "eşittir",
    "money.filter.includes": "içerir",
    "money.filter.choose": "Seçim yapın",
  },
  en: {
    "nav.home": "Home",
    "nav.products": "Products and services",
    "nav.productActivity": "Product activity",
    "nav.moneyActivity": "Money activity",
    "nav.onlineCollections": "Online collections",
    "nav.counterparties": "Counterparties",
    "nav.suppliers": "Suppliers",
    "nav.customers": "Customers",
    "nav.company": "Company",
    "nav.settings": "Settings",
    "nav.employees": "Employees",
    "nav.stores": "Stores",
    "nav.accounts": "Accounts",
    "nav.loyalty": "Loyalty",
    "nav.printForms": "Print forms",
    "nav.cashShifts": "Cash and shifts",
    "nav.financeActivity": "Finance activity",
    "nav.reports": "Reports",
    "collections.posManagement": "POS management",
    "collections.allPos": "POS and routing",
    "collections.paramPos": "Param POS",
    "collections.commissions": "POS and commission",
    "collections.paymentAi": "Payment AI",
    "collections.operations": "Operations",
    "collections.operationDetails": "Operation details",
    "collections.paymentLinks": "Payment links",
    "collections.mailSms": "Mail and SMS tracking",
    "collections.notifications": "Notification mail and SMS",
    "collections.cards": "Card list",
    "collections.dealerPos": "Dealer POS management",
    "collections.customersDealers": "Customers and dealers",
    "collections.newCollection": "New collection",
    "collections.reportGroup": "Reports",
    "collections.graphicReports": "Graphic reports",
    "collections.generalReports": "General reports",
    "collections.currentAccountOps": "Current account operations",
    "collections.accountDebt": "Accounts and debt",
    "collections.accountMovements": "Account movements",
    "collections.parameters": "Parameters",
    "collections.payment": "Settings",
    "collections.contracts": "Contracts",
    "collections.currentAccounts": "Current accounts",
    "collections.general": "General",
    "collections.ntLogin": "NT Login parameters",
    "collections.cardSettings": "Card settings",
    "collections.definitions": "Definitions",
    "collections.dynamicFields": "Dynamic fields",
    "collections.paymentItems": "Payment items",
    "collections.binFilters": "BIN filters",
    "collections.binTable": "BIN table",
    "collections.paymentPages": "Payment pages",
    "collections.reconciliation": "Reconciliation",
    "collections.webhookLogs": "Webhook logs",
    "nav.stock": "Stock",
    "nav.money": "Money",
    "action.createDocument": "Create document",
    "action.create": "Create",
    "action.logout": "Sign out",
    "action.collapse": "Collapse",
    "action.expandSidebar": "Expand sidebar",
    "action.collapseSidebar": "Collapse sidebar",
    "action.openMenu": "Open menu",
    "action.closeMenu": "Close menu",
    "action.export": "Export",
    "action.close": "Close",
    "action.edit": "Edit",
    "action.print": "Print",
    "action.delete": "Delete",
    "action.filters": "Filters",
    "action.addCondition": "Add condition",
    "action.clearFilters": "Clear filters",
    "action.select": "Select",
    "action.remove": "Remove",
    "language.select": "Select language",
    "theme.toggle": "Toggle theme",
    "login.employee": "Employee sign in",
    "login.email": "Email",
    "login.password": "Password",
    "login.passwordPlaceholder": "Enter your password",
    "login.submit": "Sign in",
    "login.demo": "Passwords are not checked in demo mode.",
    "footer.demo": "AriX · Built for demonstration — React · Tailwind · Recharts",
    "money.search": "search...",
    "money.income": "Income",
    "money.expense": "Expense",
    "money.transfer": "Transfer",
    "money.refund": "Refund",
    "money.balance": "Balance",
    "money.operationsShown": "operations shown",
    "money.noneFound": "No results found.",
    "money.noCounterparty": "No counterparty",
    "money.landedCostLinked": "Landed cost linked",
    "money.status.approved": "Approved",
    "money.status.preparing": "Preparing",
    "money.status.cancelled": "Cancelled",
    "money.column.status": "STATUS",
    "money.column.document": "DOCUMENT",
    "money.column.dateTime": "DATE / TIME",
    "money.column.account": "ACCOUNT",
    "money.column.counterparty": "COUNTERPARTY",
    "money.column.category": "CATEGORY",
    "money.column.linkedDocument": "LINKED DOCUMENT",
    "money.column.method": "METHOD",
    "money.column.amount": "AMOUNT",
    "money.column.author": "AUTHOR",
    "money.filter.title": "Condition filter",
    "money.filter.description": "Narrow money operations by account, counterparty and method.",
    "money.filter.allAdded": "All conditions added",
    "money.filter.empty": "Added conditions will appear here as compact rows.",
    "money.filter.instant": "Conditions are applied to the table immediately",
    "money.filter.date": "Date",
    "money.filter.status": "Status",
    "money.filter.kind": "Type",
    "money.filter.account": "Account",
    "money.filter.counterparty": "Counterparty",
    "money.filter.author": "Author",
    "money.filter.method": "Payment method",
    "money.filter.category": "Category",
    "money.filter.equals": "equals",
    "money.filter.includes": "includes",
    "money.filter.choose": "Choose a value",
  },
  ru: {
    "nav.home": "Главная",
    "nav.products": "Товары и услуги",
    "nav.productActivity": "Движение товаров",
    "nav.moneyActivity": "Движение денег",
    "nav.onlineCollections": "Онлайн-платежи",
    "nav.counterparties": "Контрагенты",
    "nav.suppliers": "Поставщики",
    "nav.customers": "Клиенты",
    "nav.company": "Компания",
    "nav.settings": "Настройки",
    "nav.employees": "Сотрудники",
    "nav.stores": "Магазины",
    "nav.accounts": "Счета",
    "nav.loyalty": "Лояльность",
    "nav.printForms": "Печатные формы",
    "nav.cashShifts": "Кассы и смены",
    "nav.financeActivity": "Финансовые операции",
    "nav.reports": "Отчеты",
    "collections.posManagement": "Управление POS",
    "collections.allPos": "POS и маршрутизация",
    "collections.paramPos": "Param POS",
    "collections.commissions": "POS и комиссия",
    "collections.paymentAi": "Платежный AI",
    "collections.operations": "Операции",
    "collections.operationDetails": "Детали операций",
    "collections.paymentLinks": "Платежные ссылки",
    "collections.mailSms": "Отслеживание mail и SMS",
    "collections.notifications": "Уведомления mail и SMS",
    "collections.cards": "Список карт",
    "collections.dealerPos": "Управление POS дилеров",
    "collections.customersDealers": "Клиенты и дилеры",
    "collections.newCollection": "Новый платеж",
    "collections.reportGroup": "Отчеты",
    "collections.graphicReports": "Графические отчеты",
    "collections.generalReports": "Общие отчеты",
    "collections.currentAccountOps": "Операции текущих счетов",
    "collections.accountDebt": "Счета и задолженность",
    "collections.accountMovements": "Движения по счетам",
    "collections.parameters": "Параметры",
    "collections.payment": "Параметры",
    "collections.contracts": "Договоры",
    "collections.currentAccounts": "Текущие счета",
    "collections.general": "Общие",
    "collections.ntLogin": "Параметры NT Login",
    "collections.cardSettings": "Настройки карт",
    "collections.definitions": "Справочники",
    "collections.dynamicFields": "Динамические поля",
    "collections.paymentItems": "Платежные статьи",
    "collections.binFilters": "BIN-фильтры",
    "collections.binTable": "BIN-таблица",
    "collections.paymentPages": "Страницы оплаты",
    "collections.reconciliation": "Сверка",
    "collections.webhookLogs": "Webhook-логи",
    "nav.stock": "Склад",
    "nav.money": "Деньги",
    "action.createDocument": "Создать документ",
    "action.create": "Создать",
    "action.logout": "Выйти",
    "action.collapse": "Свернуть",
    "action.expandSidebar": "Развернуть боковую панель",
    "action.collapseSidebar": "Свернуть боковую панель",
    "action.openMenu": "Открыть меню",
    "action.closeMenu": "Закрыть меню",
    "action.export": "Экспорт",
    "action.close": "Закрыть",
    "action.edit": "Изменить",
    "action.print": "Печать",
    "action.delete": "Удалить",
    "action.filters": "Фильтры",
    "action.addCondition": "Добавить условие",
    "action.clearFilters": "Очистить фильтры",
    "action.select": "Выбрать",
    "action.remove": "Удалить",
    "language.select": "Выбор языка",
    "theme.toggle": "Сменить тему",
    "login.employee": "Вход сотрудника",
    "login.email": "Эл. почта",
    "login.password": "Пароль",
    "login.passwordPlaceholder": "Введите пароль",
    "login.submit": "Войти",
    "login.demo": "В демо-режиме пароль не проверяется.",
    "footer.demo": "AriX · Демонстрационная версия — React · Tailwind · Recharts",
    "money.search": "поиск...",
    "money.income": "Приход",
    "money.expense": "Расход",
    "money.transfer": "Перевод",
    "money.refund": "Возврат",
    "money.balance": "Баланс",
    "money.operationsShown": "операций показано",
    "money.noneFound": "Ничего не найдено.",
    "money.noCounterparty": "Нет контрагента",
    "money.landedCostLinked": "Связано с себестоимостью",
    "money.status.approved": "Подтверждено",
    "money.status.preparing": "Подготовка",
    "money.status.cancelled": "Отменено",
    "money.column.status": "СТАТУС",
    "money.column.document": "ДОКУМЕНТ",
    "money.column.dateTime": "ДАТА / ВРЕМЯ",
    "money.column.account": "СЧЕТ",
    "money.column.counterparty": "КОНТРАГЕНТ",
    "money.column.category": "КАТЕГОРИЯ",
    "money.column.linkedDocument": "СВЯЗАННЫЙ ДОКУМЕНТ",
    "money.column.method": "МЕТОД",
    "money.column.amount": "СУММА",
    "money.column.author": "АВТОР",
    "money.filter.title": "Фильтр условий",
    "money.filter.description": "Отфильтруйте денежные операции по счету, контрагенту и методу.",
    "money.filter.allAdded": "Все условия добавлены",
    "money.filter.empty": "Добавленные условия появятся здесь компактными строками.",
    "money.filter.instant": "Условия применяются к таблице сразу",
    "money.filter.date": "Дата",
    "money.filter.status": "Статус",
    "money.filter.kind": "Тип",
    "money.filter.account": "Счет",
    "money.filter.counterparty": "Контрагент",
    "money.filter.author": "Автор",
    "money.filter.method": "Способ оплаты",
    "money.filter.category": "Категория",
    "money.filter.equals": "равно",
    "money.filter.includes": "содержит",
    "money.filter.choose": "Выберите значение",
  },
};

type StaticTranslation = Partial<Record<AppLanguage, string>>;

const staticUiTranslations: Record<string, StaticTranslation> = {
  "Online tahsilat": { az: "Onlayn ödənişlər", tr: "Online tahsilat", en: "Online collections", ru: "Онлайн-платежи" },
  "Tahsilatlar": { az: "Ödənişlər", tr: "Tahsilatlar", en: "Collections", ru: "Платежи" },
  "Yeni tahsilat": { az: "Yeni ödəniş", tr: "Yeni tahsilat", en: "New collection", ru: "Новый платеж" },
  "Tahsilat": { az: "Ödəniş", tr: "Tahsilat", en: "Collection", ru: "Платеж" },
  "Tahsilat məbləği": { az: "Ödəniş məbləği", tr: "Tahsilat tutarı", en: "Collection amount", ru: "Сумма платежа" },
  "Standart tahsilat": { az: "Standart ödəniş", tr: "Standart tahsilat", en: "Standard collection", ru: "Стандартный платеж" },
  "Bayi tahsilatı": { az: "Bayi ödənişi", tr: "Bayi tahsilatı", en: "Dealer collection", ru: "Платеж дилера" },
  "Üyeliksiz ödeme": { az: "Üzvlüksüz ödəniş", tr: "Üyeliksiz ödeme", en: "Guest payment", ru: "Оплата без регистрации" },
  "POS Yönetimi": { az: "POS idarəetməsi", tr: "POS yönetimi", en: "POS management", ru: "Управление POS" },
  "Bayi POS yönetimi": { az: "Bayi POS idarəetməsi", tr: "Bayi POS yönetimi", en: "Dealer POS management", ru: "Управление POS дилеров" },
  "Tüm POSlar": { az: "Bütün POSlar", tr: "Tüm POSlar", en: "All POS", ru: "Все POS" },
  "Param POS": { az: "Param POS", tr: "Param POS", en: "Param POS", ru: "Param POS" },
  "POS və komissiya": { az: "POS və komissiya", tr: "POS ve komisyon", en: "POS and commission", ru: "POS и комиссия" },
  "Taksit və komissiyalar": { az: "Taksit və komissiyalar", tr: "Taksit ve komisyonlar", en: "Installments and commissions", ru: "Рассрочки и комиссии" },
  "Taksit və komissiya": { az: "Taksit və komissiya", tr: "Taksit ve komisyon", en: "Installment and commission", ru: "Рассрочка и комиссия" },
  "Ödeme AI": { az: "Ödəniş AI", tr: "Ödeme AI", en: "Payment AI", ru: "Платежный AI" },
  "İşlemler": { az: "Əməliyyatlar", tr: "İşlemler", en: "Operations", ru: "Операции" },
  "İşlemler detay": { az: "Əməliyyat detalları", tr: "İşlem detayları", en: "Operation details", ru: "Детали операций" },
  "Ödeme linki listesi": { az: "Ödəniş linkləri", tr: "Ödeme linki listesi", en: "Payment links", ru: "Платежные ссылки" },
  "Mail SMS takip": { az: "Mail və SMS izləmə", tr: "Mail SMS takibi", en: "Mail and SMS tracking", ru: "Отслеживание mail и SMS" },
  "Bilgilendirme mail ve SMS": { az: "Bildiriş mail və SMS", tr: "Bilgilendirme mail ve SMS", en: "Notification mail and SMS", ru: "Уведомления mail и SMS" },
  "Kart listesi": { az: "Kart siyahısı", tr: "Kart listesi", en: "Card list", ru: "Список карт" },
  "Müşteriler ve bayiler": { az: "Müştərilər və bayilər", tr: "Müşteriler ve bayiler", en: "Customers and dealers", ru: "Клиенты и дилеры" },
  "Raporlar": { az: "Hesabatlar", tr: "Raporlar", en: "Reports", ru: "Отчеты" },
  "Grafik raporlar": { az: "Qrafik hesabatlar", tr: "Grafik raporlar", en: "Graphic reports", ru: "Графические отчеты" },
  "Genel raporlar": { az: "Ümumi hesabatlar", tr: "Genel raporlar", en: "General reports", ru: "Общие отчеты" },
  "Cari Hesap İşlemleri": { az: "Cari hesab əməliyyatları", tr: "Cari hesap işlemleri", en: "Current account operations", ru: "Операции текущих счетов" },
  "Hesaplar ve borçlandırma": { az: "Hesablar və borclandırma", tr: "Hesaplar ve borçlandırma", en: "Accounts and debt", ru: "Счета и задолженность" },
  "Hesap hareketleri": { az: "Hesab hərəkətləri", tr: "Hesap hareketleri", en: "Account movements", ru: "Движения по счетам" },
  "Parametreler": { az: "Parametrlər", tr: "Parametreler", en: "Parameters", ru: "Параметры" },
  "Ödeme": { az: "Ödəniş", tr: "Ödeme", en: "Payment", ru: "Оплата" },
  "Ödeme parametreleri": { az: "Ödəniş parametrləri", tr: "Ödeme parametreleri", en: "Payment parameters", ru: "Параметры оплаты" },
  "Sözleşmeler": { az: "Müqavilələr", tr: "Sözleşmeler", en: "Contracts", ru: "Договоры" },
  "Cari hesaplar": { az: "Cari hesablar", tr: "Cari hesaplar", en: "Current accounts", ru: "Текущие счета" },
  "Genel parametreler": { az: "Ümumi parametrlər", tr: "Genel parametreler", en: "General parameters", ru: "Общие параметры" },
  "NT login parametreleri": { az: "NT login parametrləri", tr: "NT login parametreleri", en: "NT login parameters", ru: "Параметры NT login" },
  "Kart ayarları": { az: "Kart ayarları", tr: "Kart ayarları", en: "Card settings", ru: "Настройки карт" },
  "Tanımlar": { az: "Təriflər", tr: "Tanımlar", en: "Definitions", ru: "Справочники" },
  "Dinamik alanlar": { az: "Dinamik sahələr", tr: "Dinamik alanlar", en: "Dynamic fields", ru: "Динамические поля" },
  "Ödeme kalemleri": { az: "Ödəniş maddələri", tr: "Ödeme kalemleri", en: "Payment items", ru: "Платежные статьи" },
  "BIN filtreleri": { az: "BIN filtrləri", tr: "BIN filtreleri", en: "BIN filters", ru: "BIN-фильтры" },
  "Mutabakat": { az: "Üzləşdirmə", tr: "Mutabakat", en: "Reconciliation", ru: "Сверка" },
  "Webhook və loglar": { az: "Webhook logları", tr: "Webhook ve loglar", en: "Webhook logs", ru: "Webhook-логи" },
  "Sanal POS, komissiya, BIN routing və link tahsilatları tək paneldə.": {
    az: "Virtual POS, komissiya, BIN yönləndirmə və ödəniş linkləri tək paneldə.",
    tr: "Sanal POS, komisyon, BIN yönlendirme ve link tahsilatları tek panelde.",
    en: "Virtual POS, commissions, BIN routing and payment links in one panel.",
    ru: "Виртуальные POS, комиссии, BIN-маршрутизация и платежные ссылки в одной панели.",
  },
  "BANKA ADI": { az: "BANK ADI", tr: "BANKA ADI", en: "BANK", ru: "БАНК" },
  "AÇIQLAMA": { az: "AÇIQLAMA", tr: "AÇIKLAMA", en: "DESCRIPTION", ru: "ОПИСАНИЕ" },
  "Toplam": { az: "Cəmi", tr: "Toplam", en: "Total", ru: "Всего" },
  "Kayıt": { az: "Qeyd", tr: "Kayıt", en: "records", ru: "записей" },
  "sayfa": { az: "səhifə", tr: "sayfa", en: "page", ru: "страница" },

  "Ana səhifə": { az: "Ana səhifə", tr: "Ana sayfa", en: "Home", ru: "Главная" },
  "Məhsullar və xidmətlər": { az: "Məhsullar və xidmətlər", tr: "Ürünler ve hizmetler", en: "Products and services", ru: "Товары и услуги" },
  "Məhsul fəaliyyəti": { az: "Məhsul fəaliyyəti", tr: "Ürün hareketleri", en: "Product activity", ru: "Движение товаров" },
  "Pul fəaliyyəti": { az: "Pul fəaliyyəti", tr: "Para hareketleri", en: "Money activity", ru: "Движение денег" },
  "Kontragentlər": { az: "Kontragentlər", tr: "Cari hesaplar", en: "Counterparties", ru: "Контрагенты" },
  "Təchizatçılar": { az: "Təchizatçılar", tr: "Tedarikçiler", en: "Suppliers", ru: "Поставщики" },
  "Müştərilər": { az: "Müştərilər", tr: "Müşteriler", en: "Customers", ru: "Клиенты" },
  "Şirkət": { az: "Şirkət", tr: "Şirket", en: "Company", ru: "Компания" },
  "Əməkdaşlar": { az: "Əməkdaşlar", tr: "Çalışanlar", en: "Employees", ru: "Сотрудники" },
  "Mağazalar": { az: "Mağazalar", tr: "Mağazalar", en: "Stores", ru: "Магазины" },
  "Hesablar": { az: "Hesablar", tr: "Hesaplar", en: "Accounts", ru: "Accounts" },
  "Sadiqlik": { az: "Sadiqlik", tr: "Sadakat", en: "Loyalty", ru: "Лояльность" },
  "Çap formaları": { az: "Çap formaları", tr: "Yazdırma formları", en: "Print forms", ru: "Печатные формы" },
  "Kassa və növbələr": { az: "Kassa və növbələr", tr: "Kasa ve vardiyalar", en: "Cash and shifts", ru: "Кассы и смены" },
  "Maliyyə fəaliyyəti": { az: "Maliyyə fəaliyyəti", tr: "Finans hareketleri", en: "Finance activity", ru: "Финансовые операции" },
  "Hesabatlar": { az: "Hesabatlar", tr: "Raporlar", en: "Reports", ru: "Отчеты" },

  "Yarat": { az: "Yarat", tr: "Oluştur", en: "Create", ru: "Создать" },
  "Sənəd yarat": { az: "Sənəd yarat", tr: "Belge oluştur", en: "Create document", ru: "Создать документ" },
  "Saxlamaq": { az: "Saxlamaq", tr: "Kaydet", en: "Save", ru: "Сохранить" },
  "Saxlanır...": { az: "Saxlanır...", tr: "Kaydediliyor...", en: "Saving...", ru: "Сохранение..." },
  "Saxla və çap et": { az: "Saxla və çap et", tr: "Kaydet ve yazdır", en: "Save and print", ru: "Сохранить и печатать" },
  "Bağla": { az: "Bağla", tr: "Kapat", en: "Close", ru: "Закрыть" },
  "Redaktə": { az: "Redaktə", tr: "Düzenle", en: "Edit", ru: "Изменить" },
  "Redaktə et": { az: "Redaktə et", tr: "Düzenle", en: "Edit", ru: "Изменить" },
  "Sil": { az: "Sil", tr: "Sil", en: "Delete", ru: "Удалить" },
  "Çap et": { az: "Çap et", tr: "Yazdır", en: "Print", ru: "Печать" },
  "İxrac": { az: "İxrac", tr: "Dışa aktar", en: "Export", ru: "Экспорт" },
  "Import": { az: "İmport", tr: "İçe aktar", en: "Import", ru: "Импорт" },
  "Export": { az: "Eksport", tr: "Dışa aktar", en: "Export", ru: "Экспорт" },
  "Filtr": { az: "Filtr", tr: "Filtre", en: "Filter", ru: "Фильтр" },
  "Filtrlər": { az: "Filtrlər", tr: "Filtreler", en: "Filters", ru: "Фильтры" },
  "Şərt əlavə et": { az: "Şərt əlavə et", tr: "Koşul ekle", en: "Add condition", ru: "Добавить условие" },
  "Seç": { az: "Seç", tr: "Seç", en: "Select", ru: "Выбрать" },
  "Seçim edin": { az: "Seçim edin", tr: "Seçim yapın", en: "Choose a value", ru: "Выберите значение" },
  "axtarış...": { az: "axtarış...", tr: "ara...", en: "search...", ru: "поиск..." },
  "axtarış…": { az: "axtarış...", tr: "ara...", en: "search...", ru: "поиск..." },
  "Məhsul axtarışı": { az: "Məhsul axtarışı", tr: "Ürün arama", en: "Product search", ru: "Поиск товара" },
  "Sənəddə məhsul üzrə axtarış": { az: "Sənəddə məhsul üzrə axtarış", tr: "Belgede ürün ara", en: "Search products in document", ru: "Поиск товара в документе" },

  "Məlumat": { az: "Məlumat", tr: "Bilgi", en: "Information", ru: "Информация" },
  "Statistika": { az: "Statistika", tr: "İstatistik", en: "Statistics", ru: "Статистика" },
  "STATUS": { az: "STATUS", tr: "DURUM", en: "STATUS", ru: "СТАТУС" },
  "SƏNƏD": { az: "SƏNƏD", tr: "BELGE", en: "DOCUMENT", ru: "ДОКУМЕНТ" },
  "TARİX / SAAT": { az: "TARİX / SAAT", tr: "TARİH / SAAT", en: "DATE / TIME", ru: "ДАТА / ВРЕМЯ" },
  "MƏHSUL": { az: "MƏHSUL", tr: "ÜRÜN", en: "PRODUCT", ru: "ТОВАР" },
  "MƏBLƏĞ": { az: "MƏBLƏĞ", tr: "TUTAR", en: "AMOUNT", ru: "СУММА" },
  "MÜƏLLİF": { az: "MÜƏLLİF", tr: "OLUŞTURAN", en: "AUTHOR", ru: "АВТОР" },
  "KONTRAGENT": { az: "KONTRAGENT", tr: "CARİ HESAP", en: "COUNTERPARTY", ru: "КОНТРАГЕНТ" },
  "Status": { az: "Status", tr: "Durum", en: "Status", ru: "Статус" },
  "Tarix": { az: "Tarix", tr: "Tarih", en: "Date", ru: "Дата" },
  "Saat": { az: "Saat", tr: "Saat", en: "Time", ru: "Время" },
  "Sənəd": { az: "Sənəd", tr: "Belge", en: "Document", ru: "Документ" },
  "Məhsul": { az: "Məhsul", tr: "Ürün", en: "Product", ru: "Товар" },
  "Məhsullar": { az: "Məhsullar", tr: "Ürünler", en: "Products", ru: "Товары" },
  "Müştəri": { az: "Müştəri", tr: "Müşteri", en: "Customer", ru: "Клиент" },
  "Təchizatçı": { az: "Təchizatçı", tr: "Tedarikçi", en: "Supplier", ru: "Поставщик" },
  "Kanal": { az: "Kanal", tr: "Kanal", en: "Channel", ru: "Канал" },
  "Məbləğ": { az: "Məbləğ", tr: "Tutar", en: "Amount", ru: "Сумма" },
  "Miqdar": { az: "Miqdar", tr: "Miktar", en: "Quantity", ru: "Количество" },
  "Qiymət": { az: "Qiymət", tr: "Fiyat", en: "Price", ru: "Цена" },
  "Endirim": { az: "Endirim", tr: "İndirim", en: "Discount", ru: "Скидка" },
  "Ümumi nəticə": { az: "Ümumi nəticə", tr: "Toplam sonuç", en: "Total", ru: "Итого" },
  "Qalıq": { az: "Qalıq", tr: "Kalan", en: "Balance", ru: "Остаток" },
  "Yekun": { az: "Yekun", tr: "Genel toplam", en: "Grand total", ru: "Итог" },
  "Şərh": { az: "Şərh", tr: "Açıklama", en: "Comment", ru: "Комментарий" },
  "Açıqlama": { az: "Açıqlama", tr: "Açıklama", en: "Description", ru: "Описание" },
  "Ölkə": { az: "Ölkə", tr: "Ülke", en: "Country", ru: "Страна" },

  "Satış": { az: "Satış", tr: "Satış", en: "Sale", ru: "Продажа" },
  "Alış": { az: "Alış", tr: "Alış", en: "Purchase", ru: "Закупка" },
  "Satış sənədi": { az: "Satış sənədi", tr: "Satış belgesi", en: "Sales document", ru: "Документ продажи" },
  "Alış sənədi": { az: "Alış sənədi", tr: "Alış belgesi", en: "Purchase document", ru: "Документ закупки" },
  "Satış sifarişi": { az: "Satış sifarişi", tr: "Satış siparişi", en: "Sales order", ru: "Заказ продажи" },
  "Alış sifarişi": { az: "Alış sifarişi", tr: "Alış siparişi", en: "Purchase order", ru: "Заказ закупки" },
  "Satışın geriqaytarması": { az: "Satışın geri qaytarılması", tr: "Satış iadesi", en: "Sales return", ru: "Возврат продажи" },
  "Alışın geriqaytarması": { az: "Alışın geri qaytarılması", tr: "Alış iadesi", en: "Purchase return", ru: "Возврат закупки" },
  "İnventarlaşdırma": { az: "İnventarlaşdırma", tr: "Envanter sayımı", en: "Stocktake", ru: "Инвентаризация" },
  "Əvvələ qalıq": { az: "Əvvələ qalıq", tr: "Başlangıç bakiyesi", en: "Opening balance", ru: "Начальный остаток" },
  "Silinmə": { az: "Silinmə", tr: "Silme", en: "Write-off", ru: "Списание" },
  "Yerdəyişmə": { az: "Yerdəyişmə", tr: "Transfer", en: "Movement", ru: "Перемещение" },
  "Transfer": { az: "Transfer", tr: "Transfer", en: "Transfer", ru: "Перевод" },
  "Mədaxil": { az: "Mədaxil", tr: "Tahsilat", en: "Income", ru: "Приход" },
  "Məxaric": { az: "Məxaric", tr: "Ödeme", en: "Expense", ru: "Расход" },
  "Köçürülmə": { az: "Köçürülmə", tr: "Transfer", en: "Transfer", ru: "Перевод" },
  "Ödənilib": { az: "Ödənilib", tr: "Ödendi", en: "Paid", ru: "Оплачено" },
  "Ödəndi": { az: "Ödəndi", tr: "Ödendi", en: "Paid", ru: "Оплачено" },
  "Qismən": { az: "Qismən", tr: "Kısmi", en: "Partial", ru: "Частично" },
  "Gözləyir": { az: "Gözləyir", tr: "Bekliyor", en: "Pending", ru: "Ожидает" },
  "Təsdiqlənib": { az: "Təsdiqlənib", tr: "Onaylandı", en: "Approved", ru: "Подтверждено" },
  "Hazırlanır": { az: "Hazırlanır", tr: "Hazırlanıyor", en: "Preparing", ru: "Подготовка" },
  "Ləğv edilib": { az: "Ləğv edilib", tr: "İptal edildi", en: "Cancelled", ru: "Отменено" },
  "Yeni": { az: "Yeni", tr: "Yeni", en: "New", ru: "Новый" },
  "Bağlıdır": { az: "Bağlıdır", tr: "Kapalı", en: "Closed", ru: "Закрыто" },
  "Fəaliyyətdədi": { az: "Fəaliyyətdədir", tr: "İşlemde", en: "In work", ru: "В работе" },
  "Statussuz": { az: "Statussuz", tr: "Durumsuz", en: "No status", ru: "Без статуса" },
  "Aktiv": { az: "Aktiv", tr: "Aktif", en: "Active", ru: "Активно" },
  "Passiv": { az: "Passiv", tr: "Pasif", en: "Passive", ru: "Неактивно" },
  "Uyğun": { az: "Uyğun", tr: "Uygun", en: "Matched", ru: "Совпадает" },
  "Fərq var": { az: "Fərq var", tr: "Fark var", en: "Difference", ru: "Есть разница" },
  "Açıldı": { az: "Açıldı", tr: "Açıldı", en: "Opened", ru: "Открыто" },
  "Göndərildi": { az: "Göndərildi", tr: "Gönderildi", en: "Sent", ru: "Отправлено" },
  "Uğursuz": { az: "Uğursuz", tr: "Başarısız", en: "Failed", ru: "Ошибка" },
  "Vaxtı keçdi": { az: "Vaxtı keçdi", tr: "Süresi doldu", en: "Expired", ru: "Истекло" },

  "Palet": { az: "Palet", tr: "Palet", en: "Pallet", ru: "Палета" },
  "palet": { az: "palet", tr: "palet", en: "pallets", ru: "палет" },
  "Rulo": { az: "Rulo", tr: "Rulo", en: "Roll", ru: "Рулон" },
  "rulo": { az: "rulo", tr: "rulo", en: "rolls", ru: "рулонов" },
  "Uzunluq": { az: "Uzunluq", tr: "Uzunluk", en: "Length", ru: "Длина" },
  "Qalınlıq": { az: "Qalınlıq", tr: "Kalınlık", en: "Thickness", ru: "Толщина" },
  "Net kg": { az: "Net kg", tr: "Net kg", en: "Net kg", ru: "Нетто кг" },
  "Gross kg": { az: "Gross kg", tr: "Brüt kg", en: "Gross kg", ru: "Брутто кг" },
  "Yığcam": { az: "Yığcam", tr: "Kompakt", en: "Compact", ru: "Кратко" },
  "Detallı": { az: "Detallı", tr: "Detaylı", en: "Detailed", ru: "Подробно" },
  "Çəkilən xərclər / Maya": { az: "Çəkilən xərclər / Maya", tr: "Ek maliyetler / Maliyet", en: "Landed costs / Cost", ru: "Доп. расходы / Себестоимость" },
  "Bu alış sənədinə bağlı xərc yoxdur. Xərci Sənəd yarat > Məxaric ilə yaradıb “Sənədə bağla” bölməsindən Maya xərci seçəndə burada görünəcək.": {
    az: "Bu alış sənədinə bağlı xərc yoxdur. Xərci Sənəd yarat > Məxaric ilə yaradıb “Sənədə bağla” bölməsindən Maya xərci seçəndə burada görünəcək.",
    tr: "Bu alış belgesine bağlı gider yok. Gideri Belge oluştur > Ödeme ile oluşturup “Belgeye bağla” bölümünden Maliyet gideri seçince burada görünür.",
    en: "No landed costs are linked to this purchase document. Create an expense from Create document > Expense and link it as a landed cost to show it here.",
    ru: "К этому документу закупки нет привязанных расходов. Создайте расход через Создать документ > Расход и привяжите его как доп. расход.",
  },
  "Sənədlə əlaqələndir": { az: "Sənədlə əlaqələndir", tr: "Belgeyle ilişkilendir", en: "Link to document", ru: "Связать с документом" },
  "Sənədə bağla": { az: "Sənədə bağla", tr: "Belgeye bağla", en: "Link document", ru: "Связать документ" },
  "Borc ödənişi": { az: "Borc ödənişi", tr: "Borç ödemesi", en: "Debt payment", ru: "Оплата долга" },
  "Maya xərci": { az: "Maya xərci", tr: "Maliyet gideri", en: "Landed cost", ru: "Доп. расход" },
  "Ödəniş əlavə et": { az: "Ödəniş əlavə et", tr: "Ödeme ekle", en: "Add payment", ru: "Добавить оплату" },
  "Tam ödə": { az: "Tam ödə", tr: "Tam öde", en: "Pay full", ru: "Оплатить полностью" },
  "Edilən ödənişlər": { az: "Edilən ödənişlər", tr: "Yapılan ödemeler", en: "Payments made", ru: "Выполненные оплаты" },
  "Ödəniş qeydi": { az: "Ödəniş qeydi", tr: "Ödeme notu", en: "Payment note", ru: "Примечание к оплате" },
  "Ödəniş üsulu": { az: "Ödəniş üsulu", tr: "Ödeme yöntemi", en: "Payment method", ru: "Способ оплаты" },
  "Nağd": { az: "Nağd", tr: "Nakit", en: "Cash", ru: "Наличные" },
  "Bank": { az: "Bank", tr: "Banka", en: "Bank", ru: "Банк" },
  "Kart": { az: "Kart", tr: "Kart", en: "Card", ru: "Карта" },
  "Hesab": { az: "Hesab", tr: "Hesap", en: "Account", ru: "Счет" },
  "Mağaza": { az: "Mağaza", tr: "Mağaza", en: "Store", ru: "Магазин" },
  "Anbar": { az: "Anbar", tr: "Depo", en: "Warehouse", ru: "Склад" },
  "Maya": { az: "Maya", tr: "Maliyet", en: "Cost", ru: "Себестоимость" },
  "Maya dəyəri": { az: "Maya dəyəri", tr: "Maliyet", en: "Cost value", ru: "Себестоимость" },
  "Alış qiyməti": { az: "Alış qiyməti", tr: "Alış fiyatı", en: "Purchase price", ru: "Закупочная цена" },
  "Satış qiyməti": { az: "Satış qiyməti", tr: "Satış fiyatı", en: "Sale price", ru: "Цена продажи" },
};

const staticPhraseTranslations: Array<{ source: string; values: StaticTranslation }> = [
  { source: "Tahsilat", values: { az: "Ödəniş", tr: "Tahsilat", en: "Collection", ru: "Платеж" } },
  { source: "tahsilatı", values: { az: "ödənişi", tr: "tahsilatı", en: "collection", ru: "платеж" } },
  { source: "tahsilatlar", values: { az: "ödənişlər", tr: "tahsilatlar", en: "collections", ru: "платежи" } },
  { source: "Ödeme", values: { az: "Ödəniş", tr: "Ödeme", en: "Payment", ru: "Оплата" } },
  { source: "İşlemler", values: { az: "Əməliyyatlar", tr: "İşlemler", en: "Operations", ru: "Операции" } },
  { source: "Müşteriler", values: { az: "Müştərilər", tr: "Müşteriler", en: "Customers", ru: "Клиенты" } },
  { source: "Tüm", values: { az: "Bütün", tr: "Tüm", en: "All", ru: "Все" } },
  { source: "Yönetimi", values: { az: "idarəetməsi", tr: "Yönetimi", en: "management", ru: "управление" } },
  { source: "yönetimi", values: { az: "idarəetməsi", tr: "yönetimi", en: "management", ru: "управление" } },
  { source: "Rapor", values: { az: "Hesabat", tr: "Rapor", en: "Report", ru: "Отчет" } },
  { source: "rapor", values: { az: "hesabat", tr: "rapor", en: "report", ru: "отчет" } },
  { source: "Parametre", values: { az: "Parametr", tr: "Parametre", en: "Parameter", ru: "Параметр" } },
  { source: "parametre", values: { az: "parametr", tr: "parametre", en: "parameter", ru: "параметр" } },
  { source: "Tanım", values: { az: "Tərif", tr: "Tanım", en: "Definition", ru: "Справочник" } },
  { source: "Tek çekim", values: { az: "Tək çəkim", tr: "Tek çekim", en: "Single payment", ru: "Один платеж" } },
  { source: "taksit", values: { az: "taksit", tr: "taksit", en: "installments", ru: "рассрочек" } },
  { source: "Tanımadı", values: { az: "Tanınmadı", tr: "Tanınmadı", en: "Not recognized", ru: "Не распознано" } },
  { source: "Manual seçim", values: { az: "Manual seçim", tr: "Manuel seçim", en: "Manual selection", ru: "Ручной выбор" } },
  { source: "Toplam", values: { az: "Cəmi", tr: "Toplam", en: "Total", ru: "Всего" } },
  { source: "Kayıt", values: { az: "Qeyd", tr: "Kayıt", en: "records", ru: "записей" } },
  { source: "sayfa", values: { az: "səhifə", tr: "sayfa", en: "page", ru: "страница" } },
  { source: "Satış sənədi", values: { az: "Satış sənədi", tr: "Satış belgesi", en: "Sales document", ru: "Документ продажи" } },
  { source: "Alış sənədi", values: { az: "Alış sənədi", tr: "Alış belgesi", en: "Purchase document", ru: "Документ закупки" } },
  { source: "Satış sifarişi", values: { az: "Satış sifarişi", tr: "Satış siparişi", en: "Sales order", ru: "Заказ продажи" } },
  { source: "Alış sifarişi", values: { az: "Alış sifarişi", tr: "Alış siparişi", en: "Purchase order", ru: "Заказ закупки" } },
  { source: "əməliyyat göstərilir", values: { az: "əməliyyat göstərilir", tr: "işlem gösteriliyor", en: "operations shown", ru: "операций показано" } },
  { source: "palet", values: { az: "palet", tr: "palet", en: "pallets", ru: "палет" } },
  { source: "rulo", values: { az: "rulo", tr: "rulo", en: "rolls", ru: "рулонов" } },
  { source: "miqdar", values: { az: "miqdar", tr: "miktar", en: "quantity", ru: "количество" } },
].sort((a, b) => b.source.length - a.source.length);

const staticTextSources = new WeakMap<Text, string>();
const staticAttributeSources = new WeakMap<Element, Map<string, string>>();
const ignoredStaticTags = new Set(["SCRIPT", "STYLE", "SVG", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CANVAS"]);
let lastStaticLanguage: AppLanguage | null = null;

export function translateStaticText(input: string, language: AppLanguage) {
  const match = input.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match) return input;
  const [, leading, body, trailing] = match;
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) return input;

  const direct = staticUiTranslations[normalized]?.[language];
  if (direct) return `${leading}${direct}${trailing}`;

  let translated = normalized;
  for (const phrase of staticPhraseTranslations) {
    const value = phrase.values[language];
    if (value && translated.includes(phrase.source)) translated = translated.split(phrase.source).join(value);
  }
  return translated === normalized ? input : `${leading}${translated}${trailing}`;
}

function shouldSkipStaticElement(element: Element | null) {
  if (!element) return true;
  if (ignoredStaticTags.has(element.tagName)) return true;
  return Boolean(element.closest("[data-no-i18n], [contenteditable='true']"));
}

function translateTextNode(node: Text, language: AppLanguage, languageChanged: boolean) {
  if (shouldSkipStaticElement(node.parentElement)) return;
  const current = node.data;
  if (!current.trim()) return;
  const mapped = staticTextSources.get(node);
  let source = mapped ?? current;
  if (mapped) {
    const expected = translateStaticText(mapped, languageChanged && lastStaticLanguage ? lastStaticLanguage : language);
    if (current !== expected && current.trim()) source = current;
  }
  staticTextSources.set(node, source);
  const next = translateStaticText(source, language);
  if (current !== next) node.data = next;
}

function translateElementAttributes(element: Element, language: AppLanguage, languageChanged: boolean) {
  if (shouldSkipStaticElement(element)) return;
  const attributes = ["placeholder", "title", "aria-label"];
  let sourceMap = staticAttributeSources.get(element);
  for (const attr of attributes) {
    const current = element.getAttribute(attr);
    if (!current || !current.trim()) continue;
    if (!sourceMap) {
      sourceMap = new Map<string, string>();
      staticAttributeSources.set(element, sourceMap);
    }
    const mapped = sourceMap.get(attr);
    let source = mapped ?? current;
    if (mapped) {
      const expected = translateStaticText(mapped, languageChanged && lastStaticLanguage ? lastStaticLanguage : language);
      if (current !== expected) source = current;
    }
    sourceMap.set(attr, source);
    const next = translateStaticText(source, language);
    if (current !== next) element.setAttribute(attr, next);
  }
}

function translateStaticTree(root: HTMLElement, language: AppLanguage, languageChanged: boolean) {
  translateElementAttributes(root, language, languageChanged);
  root.querySelectorAll("*").forEach((element) => translateElementAttributes(element, language, languageChanged));

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node as Text, language, languageChanged);
    node = walker.nextNode();
  }
}

export function useStaticDomTranslation() {
  const { language } = useI18n();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.getElementById("root");
    if (!root) return;

    let runAsLanguageChange = lastStaticLanguage !== null && lastStaticLanguage !== language;
    let frame = 0;
    const run = () => {
      frame = 0;
      translateStaticTree(root, language, runAsLanguageChange);
      lastStaticLanguage = language;
      runAsLanguageChange = false;
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(run);
    };

    run();
    const observer = new MutationObserver(schedule);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"],
    });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [language]);
}

const I18nContext = createContext<{
  language: AppLanguage;
  locale: string;
  setLanguage: (language: AppLanguage) => void;
  t: Translate;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    if (typeof window === "undefined") return "az";
    const saved = localStorage.getItem("arix-language");
    return languageOptions.some((item) => item.id === saved) ? saved as AppLanguage : "az";
  });

  useEffect(() => {
    localStorage.setItem("arix-language", language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => {
    const locale = languageOptions.find((item) => item.id === language)?.locale ?? "az-Latn-AZ";
    const t: Translate = (key, fallback) => dictionaries[language][key] ?? dictionaries.az[key] ?? fallback ?? key;
    return { language, locale, setLanguage, t };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside LanguageProvider");
  return value;
}

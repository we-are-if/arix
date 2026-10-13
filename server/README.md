# AriX API

Local development API for the AriX panel.

## Run

```powershell
npm run api
```

Default URL:

```text
http://localhost:8787
```

Vite proxies frontend `/api/*` requests to this server.

## Main Endpoints

- `GET /api/health`
- `GET /api/products`
- `GET /api/products?q=soft`
- `GET /api/products/:id`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/product-groups`
- `POST /api/product-groups`
- `GET /api/categories`
- `POST /api/categories`
- `GET /api/counterparties`
- `GET /api/counterparties?kind=customer`
- `GET /api/counterparties?kind=supplier`
- `POST /api/counterparties`
- `PATCH /api/counterparties/:id`
- `GET /api/accounting/overview`
- `GET /api/accounting/accounts`
- `POST /api/accounting/accounts`
- `GET /api/accounting/journals`
- `GET /api/accounting/trial-balance`
- `GET /api/accounting/periods`
- `GET/PATCH /api/accounting/settings`
- `GET /api/online-collections`
- `GET /api/online-collections/pos`
- `GET /api/online-collections/collections`
- `GET /api/online-collections/bin-rules`
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/e-documents`
- `GET /api/e-documents/registry?taxNumber=...`
- `POST /api/e-documents/registry/import`
- `POST /api/e-documents/sync`

Data is persisted to `server/data/db.json`. The app starts with empty business data: no demo products, customers, suppliers, documents, or collections. POS commission settings remain as configuration data.

## Current Account Cards

Customer and supplier cards keep structured Turkish identity, contact, address, classification, currency, and payment-term fields. The API generates immutable current-account references and Tekduzen subaccounts under `120` for customers and `320` for suppliers. e-Fatura/e-Arsiv is not a manual card choice: the saved VKN/TCKN and the provider registry result determine the document type.

The e-Fatura registry importer accepts the official XML or CSV user list, groups multiple mailbox aliases by VKN/TCKN, and refreshes every matching customer card. The selected receiver alias is copied into the immutable e-document snapshot for later provider delivery.

## Stock Rules

`POST /api/documents` updates stock when `posted` is not `false`.

- `sale`, `writeOff`, `purchaseReturn`: subtract from selected warehouse.
- `purchase`, `saleReturn`, `openingBalance`: add to selected warehouse.
- `movement`: subtract from source warehouse and add to target warehouse.

If stock is insufficient, the API returns `409`.

## Tax and Withholding

Sale, purchase, and return lines are recalculated by the API before they are saved. Line discounts reduce the KDV base, KDV stays outside inventory cost, and KDV withholding reduces the payable amount. Accounting entries separate input/output KDV in `191/391` and withholding in `136/360`. A line with withholding requires a three-digit GIB withholding code.

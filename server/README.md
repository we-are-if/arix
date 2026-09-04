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
- `GET /api/online-collections`
- `GET /api/online-collections/pos`
- `GET /api/online-collections/collections`
- `GET /api/online-collections/bin-rules`
- `GET /api/documents`
- `POST /api/documents`

Data is persisted to `server/data/db.json`. The app starts with empty business data: no demo products, customers, suppliers, documents, or collections. POS commission settings remain as configuration data.

## Stock Rules

`POST /api/documents` updates stock when `posted` is not `false`.

- `sale`, `writeOff`, `purchaseReturn`: subtract from selected warehouse.
- `purchase`, `saleReturn`, `openingBalance`: add to selected warehouse.
- `movement`: subtract from source warehouse and add to target warehouse.

If stock is insufficient, the API returns `409`.

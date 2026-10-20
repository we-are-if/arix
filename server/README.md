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

## Google Sign-In

Authentication uses Google Identity Services in the browser and verifies every Google ID token with `google-auth-library` on the API. AriX then creates a hashed, expiring server session and sends only an `HttpOnly`, `SameSite=Lax` cookie to the browser.

1. In Google Cloud Console create an OAuth 2.0 Client ID with application type **Web application**.
2. Add the frontend origins that will actually be used, for example `http://localhost:5173` and the project's HTTPS Tailscale origin. Plain HTTP LAN IP addresses should not be used for production sign-in.
3. Copy `.env.example` to `.env` and set `GOOGLE_CLIENT_ID` and `ARIX_AUTH_REQUIRED=1`.
4. For the first owner only, set `ARIX_GOOGLE_BOOTSTRAP_EMAILS` to the exact verified Google e-mail. Remove the bootstrap value after the first successful link.
5. Restart the API.

Existing employees are matched by verified e-mail and permanently linked to the Google `sub` identifier on first sign-in. Unknown or inactive accounts receive `403` and cannot create their own company membership.

Authentication endpoints:

- `GET /api/auth/config`
- `GET /api/auth/session`
- `POST /api/auth/google`
- `POST /api/auth/logout`
- `POST /api/auth/demo` (available only while authentication is not required)

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
- `GET /api/online-collections/providers`
- `POST /api/online-collections/providers/connections`
- `PATCH /api/online-collections/providers/connections/:id`
- `DELETE /api/online-collections/providers/connections/:id`
- `GET /api/payment-integrations/payments`
- `POST /api/payment-integrations/import`
- `PATCH /api/payment-integrations/payments/:id/match`
- `GET|POST /api/payment-integrations/accounts`
- `GET /api/payment-integrations/accounts/:id`
- `POST /api/payment-integrations/accounts/:id/cards`
- `POST /api/payment-integrations/cards/:id/transactions`
- `GET|POST /api/payment-integrations/routing-rules`
- `GET /api/payment-integrations/settlements`
- `PATCH /api/payment-integrations/settlements/:id/match`
- `GET /api/payment-integrations/bank-transactions`
- `POST /api/payment-integrations/bank-transactions/import`
- `PATCH /api/payment-integrations/bank-transactions/:id/match`

Financial accounts represent real company IBAN, cash, and store accounts. Bank account details expose their own movements, linked company cards, and routed virtual POS terminals. Card movements remain invoice-unmatched until their expense document is linked and do not reduce the bank balance a second time. POS terminals are mapped to these accounts with routing rules instead of creating fake IBAN accounts. Provider payments create customer collections and pending settlements; bank movements close those settlements without posting the customer payment twice. Direct bank transfers match customers or suppliers by IBAN, tax identifier, learned rules, and manual exception handling.
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/e-documents`
- `GET /api/e-documents/registry?taxNumber=...`
- `POST /api/e-documents/registry/import`
- `POST /api/e-documents/sync`

Data is persisted to `server/data/arix.sqlite` with WAL journaling and full synchronous durability. On first start, the legacy `server/data/db.json` is validated, archived under `server/data/backups`, and imported once; the original JSON remains untouched. SQLite backups are created daily and the latest 14 are retained. Mutating API requests are serialized in-process so concurrent users cannot overwrite one another's read-modify-write operations. The app starts with empty business data only when neither SQLite nor a legacy JSON database exists.

Online collection provider credentials are encrypted with AES-256-GCM before persistence. Production deployments should set `ARIX_CREDENTIAL_SECRET`; local development creates an ignored key file under `server/data`.

Document PDFs are generated in the browser from the selected print form. `POST /api/document-email` sends that PDF as an attachment when `ARIX_SMTP_HOST`, `ARIX_SMTP_PORT`, `ARIX_SMTP_USER`, `ARIX_SMTP_PASS`, and `ARIX_SMTP_FROM` are configured. SMTP secrets are read from the server environment and are never persisted in SQLite or returned to the client.

External provider payments are idempotent by `providerId + externalId`. Settled payments are matched by customer id, current-account code, VKN/TCKN, document number, e-mail or phone. Exact matches create a cash-in document and reduce the customer balance; unmatched payments wait for manual matching. Refunds and chargebacks restore the balance through a linked cash-out document.

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

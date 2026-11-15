# Daily development

Company records are not part of this source release. After `npm ci`, run:

```sh
node scripts/prepare-daily-dev.mjs
npm run build:daily
```

The setup copies empty examples only when the target does not exist. It never
overwrites existing local data. The generated files are ignored by Git:

- `src/importedData.ts`: imported Azart records
- `src/sparexpertDefaults.ts`: imported SpareXpert records
- `src/investorOpening.local.ts`: investor opening balances in cents
- `src/productCatalog.ts`: the private catalog with warehouse quantities

Use the existing private copies for authorized production builds. Do not deploy
a development build with empty examples as a replacement for a financial release.
This commit does not deploy anything or modify production databases.

The backend also requires the separately maintained private
`server/dailySparexpertSeed.js`. It is deliberately not distributed; do not replace
it on a live server with an empty seed. Tests that reconcile imported historical
figures require these private inputs. General parser, sync, notification and
resilience tests can be run without production records.

Removing tracked data from the current tree does not erase older Git history.
History cleanup, if needed, is a separate coordinated operation.

# Card list sources

Markdown exports from Culdcept Central, used to generate the JSON catalogs:

- `culdcept-saga-complete-card-list.md` → `src/shared/cards/sagaCatalog.json`
  ([Saga complete list](https://culdceptcentral.com/culdcept-saga/culdcept-saga-card-lists/culdcept-saga-complete-card-list))
- `culdcept-revolt-complete-card-list.md` → `src/shared/cards/revoltCatalog.json`
  ([Revolt complete list](https://www.culdceptcentral.com/culdcept-revolt/culdcept-revolt-card-lists/culdcept-revolt-complete-card-list))
  Parser keeps only cards whose names are **not** already in Saga.
- `culdcept-ps2dc-complete-card-list.md` → `src/shared/cards/ps2Catalog.json`
  ([PS2/DC complete list](https://culdceptcentral.com/ii/culdcept-ii-ps2-dc/culdcept-ps2dc-card-lists/culdcept-ps2dc-complete-card-list))
  Parser keeps only cards whose names are **not** already in Saga or Revolt extras. Medal/Extra cards are omitted.

Regenerate all:

```bash
npm run cards:parse -w app
```

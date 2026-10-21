# Card list sources

Markdown exports from Culdcept Central, used to generate the JSON catalogs:

- `culdcept-saga-complete-card-list.md` → `src/shared/cards/sagaCatalog.json`
  ([Saga complete list](https://culdceptcentral.com/culdcept-saga/culdcept-saga-card-lists/culdcept-saga-complete-card-list))
- `culdcept-revolt-complete-card-list.md` → `src/shared/cards/revoltCatalog.json`
  ([Revolt complete list](https://www.culdceptcentral.com/culdcept-revolt/culdcept-revolt-card-lists/culdcept-revolt-complete-card-list))

Regenerate both:

```bash
npm run cards:parse -w app
```

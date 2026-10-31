# Language seed

The list of languages pre-registered (inactive, unlinked) in the `languages` table by
migration `b9c0d1e2f3a4_seed_languages_bcp47.py`.

| File | What it is |
|---|---|
| `build_language_seed.py` | Generator: Unicode CLDR top 3 non-English languages per country, at least 5% speakers, plus every language the report workbook translates |
| `countries.csv` | The 194 countries of the `country` table (ISO alpha-3 code, name), snapshot of 2026-10-24 |
| `language_seed_list.csv` | Output: one row per language (205; 198 new on Test) |
| `language_seed_by_country.csv` | Output: one row per country and rank, with the speaker percentage |

To rebuild (needs the CLDR data package, which the app does not use):

```bash
cd backend
pip install "langcodes[data]"
python -m scripts_2.language_seed.build_language_seed --migration-rows
```

The migration keeps a frozen copy of the rows. A rebuilt list goes into a **new**
migration; never edit `b9c0d1e2f3a4`.

Plan and decisions: `docs/dev_docs/langauge_setup/v1_Language_Codes_BCP47_Plan.md`.

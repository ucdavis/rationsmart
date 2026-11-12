# Data packs

A **data pack** is a versioned folder of reference data that `./deploy.sh seed` loads into a database.
(Using it is explained in [DEPLOYMENT.md](../../DEPLOYMENT.md) and [CONFIGURATION.md](../../CONFIGURATION.md#loading-data).
This page is for the people who maintain the packs.)

```
data/packs/master/2026.11.01/
  manifest.json                 version, supported database versions, row counts, SHA-256 of every file
  country.jsonl  languages.jsonl  country_languages.jsonl  feed_types.jsonl  feed_categories.jsonl
  vocabulary_translations.jsonl  feeds.jsonl  feed_translations.jsonl      one JSON object per line
```

- **Reference data only.** No users, no custom feeds, no CLIMDES settings, no secrets, so a pack is safe to keep in the repository.
- Rows refer to each other by natural keys (country code, feed code, type and category names), not by database ids, so a pack loads
  into any database whose structure version is listed in `manifest.json`.
- Packs are **immutable**: changed data gets a new version folder. After a new database migration, build a new pack, because a pack
  lists the structure versions it supports and `seed` refuses others.

## Make a new pack

Run inside the API container (the pack folder must be writable, so use the repository copy):

```bash
# from a reference database (read-only):
python -m scripts_2.build_data_pack --from-db   --version 2026.12.01 --out data/packs/master
# or from an SQL export made by scripts_2.export_master_data:
python -m scripts_2.build_data_pack --from-dump export.sql --version 2026.12.01 --out data/packs/master
```

The tool refuses if the database has a table it does not know (so new tables must be classified in `scripts_2/data_pack_spec.py`).

## Check the tools

```bash
python -m scripts_2.data_pack_selftest --url postgresql://user:pass@host:5432/scratch_db [--dump export.sql]
```

It needs an **empty scratch database** (it refuses the configured one), builds it with `alembic upgrade head`, and checks: loading is
repeatable and changes nothing the second time, client edits survive, update mode on all tables, name clashes, the safety guards,
the admin tool, a byte-identical pack to database to pack round trip, and (with `--dump`) a value-for-value comparison with the
original export. CI runs it on every change under `backend/` or `data/packs/`
(`.github/workflows/data-pack-check.yml`).

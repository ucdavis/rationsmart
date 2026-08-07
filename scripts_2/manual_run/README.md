# Manual Diet Recommendation / Diet Evaluation runner

Run the **same optimization/evaluation engine the RationSmart API uses** —
directly from the command line, reading inputs from an Excel workbook,
writing an HTML report you open in a browser. No server, no database, no
`.env` file, no network connection.

This tool is tracked in git under `scripts_2/`, so a normal clone of the repo
brings everything you need — no extra files to be handed separately.

---

## Quick start

The commands below, run in order from a terminal, are everything needed to
go from nothing to a viewed report. Details, explanations, and
troubleshooting for each step are in the numbered sections further down —
read those if a command here doesn't behave as expected.

```bash
# 1. Clone the repo (use whatever URL/branch you were told to use)
git clone <repo-url> rationsmart
cd rationsmart

# 2. Set up Python 3.11
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3. Install dependencies (just what these two scripts need)
pip install numpy==2.0.2 pandas==2.2.3 scipy==1.13.1 pymoo==0.6.1.3 openpyxl==3.1.2 sqlalchemy

# 4. Run Diet Recommendation (single animal)
python -m scripts_2.manual_run.run_optimization --mode single

# 5. Run Diet Evaluation (single animal)
python -m scripts_2.manual_run.run_evaluation --mode single

# 6. Open the reports just written (macOS `open`; on Linux use `xdg-open`,
#    on Windows just double-click the files in File Explorer)
open scripts_2/manual_run/results/*.html
```

That's the "single animal" happy path. Once that works, also try the bulk
variants (every animal/scenario in one workbook, see step 4 below):

```bash
python -m scripts_2.manual_run.run_optimization --mode bulk
python -m scripts_2.manual_run.run_evaluation --mode bulk
```

---

## 1. Clone the repo

```bash
git clone <repo-url> rationsmart
cd rationsmart
```

(Use whatever URL/branch you were told to use.) `scripts_2/` comes with the
clone automatically:

```
rationsmart/
  core/
  services/
  scripts_2/
    animal_inputs_loader.py
    manual_run/
      run_optimization.py
      run_evaluation.py
      RFT_FD_Lib_Y2test.xlsx
      README.md            <- this file
      results/             <- created on first run
```

## 2. Set up Python

Requires **Python 3.11** (check with `python3 --version`).

```bash
cd rationsmart
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

## 3. Install dependencies

You only need a handful of packages for these two scripts — you do **not**
need the full backend environment (no FastAPI, no WeasyPrint/PDF, no AWS,
etc.):

```bash
pip install numpy==2.0.2 pandas==2.2.3 scipy==1.13.1 pymoo==0.6.1.3 openpyxl==3.1.2 sqlalchemy
```

(If you'd rather just reuse the project's full backend environment instead —
e.g. because you already have it set up for other work — `pip install -r
requirements.txt` from the repo root also works, it's just heavier and pulls
in packages this task doesn't use.)

No `.env` file, no database connection string, and no AWS/S3 credentials are
needed for this task — these two scripts never touch a database or the
network.

## 4. Run it

Always run these **from the `rationsmart/` repo root** (not from inside
`scripts_2/`), using `-m`:

```bash
# Diet Recommendation — one animal (reads the "Animal" sheet)
python -m scripts_2.manual_run.run_optimization --mode single

# Diet Recommendation — every animal/scenario in the "BulkAnimals" sheet
python -m scripts_2.manual_run.run_optimization --mode bulk

# Diet Evaluation — same idea, single or bulk
python -m scripts_2.manual_run.run_evaluation --mode single
python -m scripts_2.manual_run.run_evaluation --mode bulk
```

Each run prints a short summary to the terminal, e.g.:

```
NSGA3 cost-only optimization finished in 1.1 seconds (101 generations)
status=SUCCESS  total_cost(AF)=241635.00  water_intake=81.48
report: scripts_2/manual_run/results/diet_recommendation_animal_20260803-163834.html
```

## 5. Where to look for results

Every run writes one **standalone HTML file** to `scripts_2/manual_run/results/`
(unless you pass `--output-dir`, see below). That folder is git-ignored
(generated output, not source), so it won't show up until you run something,
and anything you generate stays local — it won't get committed by accident:

```
diet_recommendation_<animal_id>_<timestamp>.html
diet_evaluation_<animal_id>_<timestamp>.html
```

Open the file directly in any browser (double-click it, or
`open scripts_2/manual_run/results/<file>.html` on macOS). It's the exact
same report layout/content as the PDF a real user gets from "Save Report" in
the app — same icons, same numbers, same warnings — just viewed as HTML
instead of PDF.

**Keep the file inside the repo checkout** (don't move just the `.html` file
to another folder or machine on its own) — the icons load from
`core/z_optimization/assets/` via a local file path, so they'll show as
broken images if the report is opened somewhere that path doesn't exist.

## 6. Changing what gets tested

Everything the runners read comes from one workbook:
`scripts_2/manual_run/RFT_FD_Lib_Y2test.xlsx`. Open it in Excel and edit:

- **`Fd_selected`** sheet — the feed library (feed names, nutrient values,
  cost per kg, optional min/max inclusion). Row 1 holds the field names
  (`fd_name`, `fd_cost`, `fd_cp`, ...) as column headers; each row after
  that is one feed.
- **`Animal`** sheet — a single animal's characteristics (breed, body
  weight, days in milk, milk production target, etc.) for `--mode single`.
- **`BulkAnimals`** sheet — same fields as `Animal`, but one animal/scenario
  per column (row 0 holds the ID/label for each column), for `--mode bulk`.
- Both animal sheets can end with an **`Ingredient (kg AF)`** block — one row
  per feed (same order as `Fd_selected`), giving the as-fed kg/day of that
  feed. This is **required for Diet Evaluation** (it's the ration being
  scored) and **ignored for Diet Recommendation** (which decides its own mix).

Save the workbook and re-run — no restart or code change needed. If you edit
this workbook, remember it's tracked in git like any other source file —
commit your changes if you want them to stick around for the next person.

To use a completely different workbook (must follow the same sheet layout),
or write results elsewhere:

```bash
python -m scripts_2.manual_run.run_optimization --file /path/to/your.xlsx --output-dir /path/to/reports
python -m scripts_2.manual_run.run_evaluation --file /path/to/your.xlsx --output-dir /path/to/reports
```

## 7. Troubleshooting

- **`ModuleNotFoundError: No module named 'core'` (or `scripts_2`)** — you're
  either not running from the repo root, or not using `-m`. Re-run as
  `python -m scripts_2.manual_run.run_optimization` from the `rationsmart/`
  folder.
- **`Input workbook not found`** — check `scripts_2/manual_run/` actually
  contains `RFT_FD_Lib_Y2test.xlsx`, or pass `--file` with a full path.
- **A bulk run says one animal "failed" but keeps going** — by design: bulk
  mode logs the error for that one column and continues with the rest,
  rather than stopping the whole batch.
- **Icons look broken when you open the HTML report** — see the note at the
  end of step 5; the report needs to stay inside the repo checkout to find
  `core/z_optimization/assets/`.
- **`pip install -r requirements.txt` fails on `weasyprint`** — safe to
  ignore for this task; these two scripts never import WeasyPrint (that's
  the PDF converter used by the live server, not by this tool). Use the
  minimal install list in step 3 instead.

## What this actually runs, if you're curious

Both scripts call the **exact same functions** the live API uses — not a
re-implementation — so results here match what the app would produce for
the same inputs:

| Task | Script | Calls the same engine function as |
|---|---|---|
| Diet Recommendation | `run_optimization.py` | `core.z_optimization.nsga3_runner.z_optimization_main` |
| Diet Evaluation | `run_evaluation.py` | `core.z_optimization.evaluation.evaluate_diet` |
| HTML report | both | `core.z_optimization.report_generation.rsm_generate_report_v2` (the same renderer behind the saved-report PDF) |

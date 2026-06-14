#!/usr/bin/env python3
"""
Phase 0 — Functional-Parity Baseline harness.

Two modes:

  capture   Hit each read-only endpoint on the TESTING environment and save the
            responses as the "golden truth".
              python tests/refactoring/phase0_baseline.py capture --base-url http://47.128.1.51:8000

  compare   Hit the same endpoints on a target (e.g. your LOCAL refactored app)
            and diff the response against the saved golden truth.
              python tests/refactoring/phase0_baseline.py compare --base-url http://localhost:8000

Layout (all relative to this file's folder, tests/refactoring/):
  requests/   request bodies for POST endpoints
  golden/     captured "correct" responses to compare against

Notes
-----
* Two endpoints have side effects (write Report row + upload PDF to S3):
    /diet-recommendation-working/  and  /diet-evaluation-working/
  Only run `capture` against the testing environment intentionally.
  All other endpoints in this list are read-only.
* Recommendation uses NSGA-III (stochastic) — numeric tolerance applies (--rec-tol).
* All other endpoints are deterministic — near-exact tolerance applies (--other-tol).
* Volatile keys (IDs, URLs, timestamps) are ignored when diffing.
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REQUESTS = HERE / "requests"
GOLDEN = HERE / "golden"

# ── Fixed IDs (verified against the live DB 2026-06-11) ──────────────────────
USER_ID              = "06a83ece-5d1a-470b-9c23-fd1c8bdbd8c7"   # satish.bagali@gmail.com (also admin)
USER_EMAIL           = "satish.bagali@gmail.com"
VN_COUNTRY           = "6c2a0573-1500-4603-8795-633ff80f1b00"   # Vietnam (VND)
CONCENTRATE_FEED     = "6f6069fc-46a0-4e24-938e-254400f97ca8"   # Commercial concentrate
FORAGE_TYPE          = "829f8d2f-f55e-49f2-b194-b7f48a302da9"   # feed_types: Forage
BYPRODUCT_FORAGE_CAT = "a403f7f5-d7c0-411a-9cb6-b1cdf56570e8"  # feed_categories: By-Product/Other-Forage
REPORT_ID            = "rec-3260hbrpoi"                          # known saved report for this user

# ── Endpoint catalogue ────────────────────────────────────────────────────────
# Each entry: label, method, path, query (dict), body (fixture filename or absent).
# query-params are url-encoded and appended to path automatically.
# body fixture must live in requests/ and is only used for POST.
CASES = [
    # ── Stochastic — numeric tolerance applies ────────────────────────────────
    {"label": "recommendation",
     "method": "POST", "path": "/diet-recommendation-working/",
     "query": {}, "body": "recommendation_request.json"},

    # ── Deterministic POST ────────────────────────────────────────────────────
    {"label": "evaluation",
     "method": "POST", "path": "/diet-evaluation-working/",
     "query": {}, "body": "evaluation_request.json"},
    {"label": "check_insert_or_update",
     "method": "POST", "path": "/check-insert-or-update/",
     "query": {}, "body": "check_insert_or_update_request.json"},
    {"label": "fetch_all_simulations",
     "method": "POST", "path": "/fetch-all-simulations/",
     "query": {}, "body": "fetch_all_simulations_request.json"},
    {"label": "fetch_simulation_details",
     "method": "POST", "path": "/fetch-simulation-details/",
     "query": {}, "body": "fetch_simulation_details_request.json"},

    # ── Root ──────────────────────────────────────────────────────────────────
    {"label": "root",
     "method": "GET", "path": "/", "query": {}},

    # ── Auth ─────────────────────────────────────────────────────────────────
    {"label": "auth_countries",
     "method": "GET", "path": "/auth/countries", "query": {}},
    {"label": "auth_email_config",
     "method": "GET", "path": "/auth/email-config", "query": {}},
    {"label": "auth_user",
     "method": "GET", "path": f"/auth/user/{USER_EMAIL}", "query": {}},

    # ── Animal — feed catalogue ───────────────────────────────────────────────
    {"label": "unique_feed_type",
     "method": "GET",
     "path": f"/unique-feed-type/{VN_COUNTRY}/{USER_ID}", "query": {}},
    {"label": "unique_feed_category",
     "method": "GET", "path": "/unique-feed-category",
     "query": {"feed_type": "Forage", "country_id": VN_COUNTRY, "user_id": USER_ID}},
    {"label": "feed_name",
     "method": "GET", "path": "/feed-name",
     "query": {"feed_type": "Forage", "feed_category": "Grass/Legume Forage",
               "country_id": VN_COUNTRY, "user_id": USER_ID}},
    {"label": "feed_details",
     "method": "GET",
     "path": f"/feed-details/{USER_ID}/{CONCENTRATE_FEED}", "query": {}},
    {"label": "feeds_list",
     "method": "GET", "path": "/feeds/",
     "query": {"country_id": VN_COUNTRY, "limit": "20"}},
    {"label": "feed_by_id",
     "method": "GET", "path": f"/feeds/{CONCENTRATE_FEED}", "query": {}},

    # ── Animal — report reads ─────────────────────────────────────────────────
    {"label": "pdf_reports",
     "method": "GET", "path": f"/pdf-reports/{USER_ID}", "query": {}},
    {"label": "get_user_reports",
     "method": "GET", "path": "/get-user-reports/",
     "query": {"user_id": USER_ID}},

    # ── Feed classification ───────────────────────────────────────────────────
    {"label": "feed_types",
     "method": "GET", "path": "/feed-classification/get-feed-types", "query": {}},
    {"label": "feed_type_by_id",
     "method": "GET",
     "path": f"/feed-classification/types/{FORAGE_TYPE}", "query": {}},
    {"label": "categories_by_type",
     "method": "GET",
     "path": f"/feed-classification/get-categories/{FORAGE_TYPE}", "query": {}},
    {"label": "feed_category_by_id",
     "method": "GET",
     "path": f"/feed-classification/get-feed-category/{BYPRODUCT_FORAGE_CAT}", "query": {}},
    {"label": "feed_classification_structure",
     "method": "GET", "path": "/feed-classification/structure", "query": {}},

    # ── User feedback ─────────────────────────────────────────────────────────
    {"label": "user_feedback_my",
     "method": "GET", "path": "/user-feedback/my",
     "query": {"user_id": USER_ID}},

    # ── Admin reads (test user is also admin) ─────────────────────────────────
    {"label": "admin_users",
     "method": "GET", "path": "/admin/users",
     "query": {"admin_user_id": USER_ID}},
    {"label": "admin_list_feeds",
     "method": "GET", "path": "/admin/list-feeds",
     "query": {"admin_user_id": USER_ID}},
    {"label": "admin_list_feed_types",
     "method": "GET", "path": "/admin/list-feed-types",
     "query": {"admin_user_id": USER_ID}},
    {"label": "admin_list_feed_categories",
     "method": "GET", "path": "/admin/list-feed-categories",
     "query": {"admin_user_id": USER_ID}},
    {"label": "admin_feedback_all",
     "method": "GET", "path": "/admin/user-feedback/all",
     "query": {"admin_user_id": USER_ID}},
    {"label": "admin_feedback_stats",
     "method": "GET", "path": "/admin/user-feedback/stats",
     "query": {"admin_user_id": USER_ID}},
    {"label": "admin_get_all_reports",
     "method": "GET", "path": "/admin/get-all-reports/",
     "query": {"user_id": USER_ID}},
]

# Keys whose values change every run — ignored when comparing.
VOLATILE_KEYS = {
    "report_id", "simulation_id", "bucket_url", "url", "pdf_url", "file_url",
    "created_at", "updated_at", "timestamp", "generated_at", "generated_date",
    "id", "user_name",
}


def strip_annotations(obj):
    """Remove _comment / _feed annotation keys before sending."""
    if isinstance(obj, dict):
        return {k: strip_annotations(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [strip_annotations(v) for v in obj]
    return obj


def make_request(base_url, method, path, query, payload, timeout):
    url = base_url.rstrip("/") + path
    if query:
        url += "?" + urllib.parse.urlencode(query)

    if method == "POST" and payload is not None:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"}, method="POST",
        )
    else:
        req = urllib.request.Request(url, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body_bytes = resp.read()
            try:
                body = json.loads(body_bytes.decode())
            except Exception:
                body = body_bytes.decode(errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            body = json.loads(body)
        except Exception:
            pass
        return e.code, body


def diff(golden, actual, rel_tol, path=""):
    """Yield human-readable mismatch strings. Numeric leaves compared within rel_tol."""
    if isinstance(golden, dict) and isinstance(actual, dict):
        for k in golden:
            if k in VOLATILE_KEYS:
                continue
            if k not in actual:
                yield f"{path}/{k}: missing in actual"
            else:
                yield from diff(golden[k], actual[k], rel_tol, f"{path}/{k}")
        for k in actual:
            if k not in golden and k not in VOLATILE_KEYS:
                yield f"{path}/{k}: unexpected key in actual"
    elif isinstance(golden, list) and isinstance(actual, list):
        if len(golden) != len(actual):
            yield f"{path}: list length {len(golden)} -> {len(actual)}"
        for i, (g, a) in enumerate(zip(golden, actual)):
            yield from diff(g, a, rel_tol, f"{path}[{i}]")
    elif isinstance(golden, (int, float)) and isinstance(actual, (int, float)) \
            and not isinstance(golden, bool) and not isinstance(actual, bool):
        if golden == actual:
            return
        denom = max(abs(golden), 1e-9)
        if abs(golden - actual) / denom > rel_tol:
            yield (f"{path}: {golden} -> {actual} "
                   f"(rel diff {abs(golden-actual)/denom:.3%} > {rel_tol:.1%})")
    else:
        if golden != actual:
            yield f"{path}: {golden!r} -> {actual!r}"


def main():
    ap = argparse.ArgumentParser(description="Phase 0 baseline capture/compare")
    ap.add_argument("mode", choices=["capture", "compare"])
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--timeout", type=int, default=180)
    ap.add_argument("--rec-tol",   type=float, default=0.02,
                    help="tolerance for recommendation (stochastic, default 2%%)")
    ap.add_argument("--other-tol", type=float, default=1e-6,
                    help="tolerance for all other endpoints (deterministic, default 1e-6)")
    ap.add_argument("--only", metavar="LABEL", action="append",
                    help="run only this label (repeatable, e.g. --only root --only auth_countries)")
    args = ap.parse_args()

    GOLDEN.mkdir(parents=True, exist_ok=True)

    cases = CASES
    if args.only:
        cases = [c for c in CASES if c["label"] in args.only]
        if not cases:
            print(f"No cases matched --only {args.only}"); sys.exit(1)

    overall_ok = True

    for case in cases:
        label  = case["label"]
        method = case["method"]
        path   = case["path"]
        query  = case.get("query", {})
        body_f = case.get("body")

        payload = None
        if body_f:
            fixture = REQUESTS / body_f
            if not fixture.exists():
                print(f"\n[SKIP] {label}: fixture {fixture} not found")
                continue
            payload = strip_annotations(json.loads(fixture.read_text()))

        display_url = path + ("?" + urllib.parse.urlencode(query) if query else "")
        print(f"\n=== {label}  {method} {display_url} ===")

        status, body = make_request(args.base_url, method, path, query, payload, args.timeout)
        print(f"HTTP {status}")

        if args.mode == "capture":
            out = GOLDEN / f"{label}_response.json"
            out.write_text(json.dumps({"status": status, "body": body}, indent=2))
            print(f"saved -> {out.relative_to(HERE.parent.parent)}")
            if status >= 400:
                print("  WARNING: error status captured — check the request")
                overall_ok = False
        else:
            golden_file = GOLDEN / f"{label}_response.json"
            if not golden_file.exists():
                print(f"  no golden for {label}; run capture first")
                overall_ok = False
                continue
            golden = json.loads(golden_file.read_text())
            tol = args.rec_tol if label == "recommendation" else args.other_tol
            mismatches = list(diff(golden.get("body"), body, tol))
            if golden.get("status") != status:
                mismatches.insert(0, f"HTTP status {golden.get('status')} -> {status}")
            if mismatches:
                overall_ok = False
                print(f"  X {len(mismatches)} mismatch(es) (tol={tol}):")
                for m in mismatches[:40]:
                    print("    -", m)
                if len(mismatches) > 40:
                    print(f"    ... and {len(mismatches)-40} more")
            else:
                print(f"  OK within tolerance {tol}")

    print("\nRESULT:", "OK" if overall_ok else "DIFFERENCES FOUND")
    sys.exit(0 if overall_ok else 1)


if __name__ == "__main__":
    main()

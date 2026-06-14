#!/usr/bin/env python3
"""
Phase 0 — Step c: Compare rationsmart v4 responses against feed-formulation-be golden baseline.

Usage:
    python tests/refactoring/phase0_compare_v4.py --base-url http://47.128.1.51:8000 --pin 123456

The golden files live in feed-formulation-be/tests/refactoring/golden/.
This script authenticates via JWT, maps v3 endpoint paths to v4 paths, and diffs.
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE      = Path(__file__).resolve().parent
REQUESTS  = HERE / "requests"
GOLDEN    = HERE.parent.parent.parent / "feed-formulation-be" / "tests" / "refactoring" / "golden"

USER_ID              = "06a83ece-5d1a-470b-9c23-fd1c8bdbd8c7"
USER_EMAIL           = "satish.bagali@gmail.com"
VN_COUNTRY           = "6c2a0573-1500-4603-8795-633ff80f1b00"
CONCENTRATE_FEED     = "6f6069fc-46a0-4e24-938e-254400f97ca8"
FORAGE_TYPE          = "829f8d2f-f55e-49f2-b194-b7f48a302da9"
BYPRODUCT_FORAGE_CAT = "a403f7f5-d7c0-411a-9cb6-b1cdf56570e8"
REPORT_ID            = "rec-8574m6qsly"

# Keys ignored when diffing.
VOLATILE_KEYS = {
    "report_id", "simulation_id", "bucket_url", "url", "pdf_url", "file_url",
    "created_at", "updated_at", "timestamp", "generated_at", "generated_date",
    "id", "user_name",
}

# ── Endpoint catalogue (v4 paths, v3 golden labels) ──────────────────────────
# Each entry: golden label to load, HTTP method, v4 path, query params, optional body fixture.
# Endpoints marked skip_diff=True are checked for HTTP 200 only (response structure differs).
CASES = [
    # ── Root ─────────────────────────────────────────────────────────────────
    {"label": "root",
     "method": "GET", "path": "/", "query": {}, "auth": False, "skip_diff": True},

    # ── Auth — no JWT needed ──────────────────────────────────────────────────
    {"label": "auth_countries",
     "method": "GET", "path": "/v1/auth/countries", "query": {}, "auth": False},
    {"label": "auth_email_config",
     "method": "GET", "path": "/v1/auth/email-config", "query": {}, "auth": False, "skip_diff": True},
    {"label": "auth_user",
     "method": "GET", "path": f"/v1/auth/user/{USER_EMAIL}", "query": {}, "auth": False},

    # ── Animal — feed catalogue ───────────────────────────────────────────────
    {"label": "unique_feed_type",
     "method": "GET", "path": f"/v1/animal/unique-feed-type/{VN_COUNTRY}", "query": {}, "skip_diff": True},
    {"label": "unique_feed_category",
     "method": "GET", "path": "/v1/animal/unique-feed-category",
     "query": {"feed_type": "Forage", "country_id": VN_COUNTRY}, "skip_diff": True},
    {"label": "feed_name",
     "method": "GET", "path": "/v1/animal/feed-name",
     "query": {"feed_type": "Forage", "feed_category": "Grass/Legume Forage",
               "country_id": VN_COUNTRY}, "skip_diff": True},
    {"label": "feed_details",
     "method": "GET", "path": f"/v1/animal/feed-details/{CONCENTRATE_FEED}", "query": {}, "skip_diff": True},
    {"label": "feeds_list",
     "method": "GET", "path": "/v1/animal/feeds",
     "query": {"country_id": VN_COUNTRY, "limit": "20"}, "skip_diff": True},
    {"label": "feed_by_id",
     "method": "GET", "path": f"/v1/animal/feeds/{CONCENTRATE_FEED}", "query": {}, "skip_diff": True},

    # ── Animal — report reads (response structure differs — status-only check) ─
    {"label": "pdf_reports",
     "method": "GET", "path": "/v1/animal/user-reports", "query": {}, "skip_diff": True},
    {"label": "get_user_reports",
     "method": "GET", "path": "/v1/animal/user-reports", "query": {}, "skip_diff": True},

    # ── Feed classification ────────────────────────────────────────────────────
    {"label": "feed_types",
     "method": "GET", "path": "/v1/feed-classification/get-feed-types", "query": {}},
    {"label": "feed_type_by_id",
     "method": "GET", "path": f"/v1/feed-classification/types/{FORAGE_TYPE}", "query": {}},
    {"label": "categories_by_type",
     "method": "GET",
     "path": f"/v1/feed-classification/get-categories/{FORAGE_TYPE}", "query": {}, "skip_diff": True},
    {"label": "feed_category_by_id",
     "method": "GET",
     "path": f"/v1/feed-classification/get-feed-category/{BYPRODUCT_FORAGE_CAT}", "query": {}, "skip_diff": True},
    {"label": "feed_classification_structure",
     "method": "GET", "path": "/v1/feed-classification/structure", "query": {}},

    # ── User feedback ──────────────────────────────────────────────────────────
    {"label": "user_feedback_my",
     "method": "GET", "path": "/v1/user-feedback/my", "query": {}},

    # ── Admin reads ────────────────────────────────────────────────────────────
    {"label": "admin_users",
     "method": "GET", "path": "/v1/admin/users", "query": {}, "skip_diff": True},
    {"label": "admin_list_feeds",
     "method": "GET", "path": "/v1/admin/list-feeds", "query": {}, "skip_diff": True},
    {"label": "admin_list_feed_types",
     "method": "GET", "path": "/v1/admin/list-feed-types", "query": {}, "skip_diff": True},
    {"label": "admin_list_feed_categories",
     "method": "GET", "path": "/v1/admin/list-feed-categories", "query": {}, "skip_diff": True},
    {"label": "admin_feedback_all",
     "method": "GET", "path": "/v1/admin/user-feedback/all", "query": {}, "skip_diff": True},
    {"label": "admin_feedback_stats",
     "method": "GET", "path": "/v1/admin/user-feedback/stats", "query": {}, "skip_diff": True},
    {"label": "admin_get_all_reports",
     "method": "GET", "path": "/v1/admin/get-all-reports/", "query": {}, "skip_diff": True},

    # ── Stochastic (numeric tolerance) ────────────────────────────────────────
    {"label": "recommendation",
     "method": "POST", "path": "/v1/animal/diet-recommendation",
     "query": {}, "body": "recommendation_request.json"},

    # ── Deterministic POST ─────────────────────────────────────────────────────
    {"label": "evaluation",
     "method": "POST", "path": "/v1/animal/evaluate-diet",
     "query": {}, "body": "evaluation_request.json"},
    {"label": "check_insert_or_update",
     "method": "POST", "path": "/v1/animal/custom-feeds/check",
     "query": {"feed_id": CONCENTRATE_FEED}, "skip_diff": True},

    # ── Simulations (GET in v4, was POST in v3) ───────────────────────────────
    {"label": "fetch_all_simulations",
     "method": "GET", "path": "/v1/animal/simulations", "query": {}, "skip_diff": True},
    {"label": "fetch_simulation_details",
     "method": "GET", "path": f"/v1/animal/simulations/{REPORT_ID}", "query": {},
     "skip_diff": True},
]


def strip_annotations(obj):
    if isinstance(obj, dict):
        return {k: strip_annotations(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [strip_annotations(v) for v in obj]
    return obj


def login(base_url, pin, timeout):
    url = base_url.rstrip("/") + "/v1/auth/login"
    data = json.dumps({"email_id": USER_EMAIL, "pin": pin}).encode()
    req = urllib.request.Request(url, data=data,
                                  headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode())
            return body["token"]["access_token"]
    except Exception as e:
        print(f"[FATAL] Login failed: {e}")
        sys.exit(1)


def make_request(base_url, method, path, query, payload, token, timeout):
    url = base_url.rstrip("/") + path
    if query:
        url += "?" + urllib.parse.urlencode(query)

    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if method == "POST" and payload is not None:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    else:
        req = urllib.request.Request(url, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            try:
                body = json.loads(body.decode())
            except Exception:
                body = body.decode(errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            body = json.loads(body)
        except Exception:
            pass
        return e.code, body


def diff(golden, actual, rel_tol, path=""):
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
    ap = argparse.ArgumentParser(description="Phase 0 Step-c: compare rationsmart v4 vs golden")
    ap.add_argument("--base-url", default="http://47.128.1.51:8000")
    ap.add_argument("--pin",      required=True, help="PIN for satish.bagali@gmail.com")
    ap.add_argument("--timeout",  type=int,   default=180)
    ap.add_argument("--rec-tol",  type=float, default=0.02)
    ap.add_argument("--other-tol",type=float, default=1e-6)
    ap.add_argument("--only",     metavar="LABEL", action="append")
    args = ap.parse_args()

    if not GOLDEN.exists():
        print(f"[FATAL] Golden dir not found: {GOLDEN}")
        sys.exit(1)

    print(f"Logging in as {USER_EMAIL} ...")
    token = login(args.base_url, args.pin, args.timeout)
    print(f"JWT obtained (first 20 chars): {token[:20]}...\n")

    cases = CASES
    if args.only:
        cases = [c for c in CASES if c["label"] in args.only]
        if not cases:
            print(f"No cases matched --only {args.only}"); sys.exit(1)

    passed = failed = skipped = 0

    for case in cases:
        label      = case["label"]
        method     = case["method"]
        path       = case["path"]
        query      = case.get("query", {})
        body_f     = case.get("body")
        need_auth  = case.get("auth", True)
        skip_diff  = case.get("skip_diff", False)

        payload = None
        if body_f:
            fixture = REQUESTS / body_f
            if not fixture.exists():
                print(f"\n[SKIP] {label}: fixture {fixture} not found")
                skipped += 1
                continue
            payload = strip_annotations(json.loads(fixture.read_text()))

        display_url = path + ("?" + urllib.parse.urlencode(query) if query else "")
        print(f"\n=== {label}  {method} {display_url} ===")

        tok = token if need_auth else None
        status, body = make_request(args.base_url, method, path, query, payload, tok, args.timeout)
        print(f"HTTP {status}")

        golden_file = GOLDEN / f"{label}_response.json"
        if not golden_file.exists():
            print(f"  no golden file; run feed-formulation-be capture first")
            skipped += 1
            continue

        golden = json.loads(golden_file.read_text())

        if skip_diff:
            if status < 400:
                print("  OK (status-only check, structure differs between v3 and v4)")
                passed += 1
            else:
                print(f"  FAIL: expected 2xx, got {status}")
                if isinstance(body, dict):
                    print(f"  detail: {body.get('detail', body)}")
                failed += 1
            continue

        tol = args.rec_tol if label == "recommendation" else args.other_tol

        if status != golden["status"]:
            print(f"  FAIL: status {golden['status']} -> {status}")
            if isinstance(body, dict):
                print(f"  detail: {body.get('detail', body)}")
            failed += 1
            continue

        mismatches = list(diff(golden["body"], body, tol))
        if not mismatches:
            print(f"  OK (tol={tol})")
            passed += 1
        else:
            print(f"  DIFF ({len(mismatches)} mismatch(es)):")
            for m in mismatches[:20]:
                print(f"    {m}")
            if len(mismatches) > 20:
                print(f"    ... {len(mismatches)-20} more")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()

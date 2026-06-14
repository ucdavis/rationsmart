# Refactoring — Phase 0 Functional-Parity Baseline

This folder holds the **"golden truth"** for the RationSmart refactoring: the responses
the *current* working system produces, so the refactored code can be checked against them.

## Layout

```
tests/refactoring/
  phase0_baseline.py          ← capture/compare harness
  requests/                   ← POST request bodies
    recommendation_request.json
    evaluation_request.json
    check_insert_or_update_request.json
    fetch_all_simulations_request.json
    fetch_simulation_details_request.json
  golden/                     ← captured "correct" responses (one file per endpoint)
    recommendation_response.json
    evaluation_response.json
    root_response.json
    auth_countries_response.json
    ... (30 files total after full capture)
```

## Environments

- **Golden truth** = the **testing** environment: `http://47.128.1.51:8000`
- **Compare target** = your **local** refactored app (e.g. `http://localhost:8000`)

## Usage

### Capture all golden responses from the testing environment

```bash
python tests/refactoring/phase0_baseline.py capture --base-url http://47.128.1.51:8000
```

### After changing code, run the local app and compare

```bash
python tests/refactoring/phase0_baseline.py compare --base-url http://localhost:8000
```

Green (`OK`) = behaviour preserved. Red (`DIFFERENCES FOUND`) = lists each changed field.

### Run only specific endpoints

```bash
python tests/refactoring/phase0_baseline.py compare --base-url http://localhost:8000 \
  --only root --only auth_countries --only feeds_list
```

### Adjust tolerance

```bash
# Wider tolerance for recommendation (stochastic optimizer)
python tests/refactoring/phase0_baseline.py compare --base-url http://localhost:8000 --rec-tol 0.05

# Tighter tolerance for deterministic endpoints
python tests/refactoring/phase0_baseline.py compare --base-url http://localhost:8000 --other-tol 0
```

## Endpoint coverage (30 total)

| Label | Method | Path |
|-------|--------|------|
| recommendation | POST | /diet-recommendation-working/ |
| evaluation | POST | /diet-evaluation-working/ |
| check_insert_or_update | POST | /check-insert-or-update/ |
| fetch_all_simulations | POST | /fetch-all-simulations/ |
| fetch_simulation_details | POST | /fetch-simulation-details/ |
| root | GET | / |
| auth_countries | GET | /auth/countries |
| auth_email_config | GET | /auth/email-config |
| auth_user | GET | /auth/user/{email} |
| unique_feed_type | GET | /unique-feed-type/{country}/{user} |
| unique_feed_category | GET | /unique-feed-category?feed_type=Forage&… |
| feed_name | GET | /feed-name?feed_type=Forage&… |
| feed_details | GET | /feed-details/{user}/{feed} |
| feeds_list | GET | /feeds/?country_id=…&limit=20 |
| feed_by_id | GET | /feeds/{feed_id} |
| pdf_reports | GET | /pdf-reports/{user} |
| get_user_reports | GET | /get-user-reports/?user_id=… |
| feed_types | GET | /feed-classification/get-feed-types |
| feed_type_by_id | GET | /feed-classification/types/{type_id} |
| categories_by_type | GET | /feed-classification/get-categories/{type_id} |
| feed_category_by_id | GET | /feed-classification/get-feed-category/{cat_id} |
| feed_classification_structure | GET | /feed-classification/structure |
| user_feedback_my | GET | /user-feedback/my?user_id=… |
| admin_users | GET | /admin/users?admin_user_id=… |
| admin_list_feeds | GET | /admin/list-feeds?admin_user_id=… |
| admin_list_feed_types | GET | /admin/list-feed-types?admin_user_id=… |
| admin_list_feed_categories | GET | /admin/list-feed-categories?admin_user_id=… |
| admin_feedback_all | GET | /admin/user-feedback/all?admin_user_id=… |
| admin_feedback_stats | GET | /admin/user-feedback/stats?admin_user_id=… |
| admin_get_all_reports | GET | /admin/get-all-reports/?user_id=… |

**Not included** (write/destructive or binary response):
- `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-pin`, `POST /auth/change-pin`
- `POST /generate-pdf-report/`, `POST /generate-report/`, `POST /save-report/`
- `POST /insert-custom-feed/`, `POST /update-custom-feed/`, `POST /feed-analytics/`
- `DELETE` endpoints, bulk-upload, Excel export, S3 logfile read
- `GET /pdf-report/{report_id}/{user_id}` — returns binary PDF

## Notes

- **Recommendation is stochastic** (NSGA-III) — small run-to-run variation is normal,
  compared within `--rec-tol` (default 2%). **All other endpoints are deterministic**
  and compared near-exactly (`--other-tol`, default 1e-6).
- Volatile fields (`report_id`, URLs, timestamps, `user_name`) are ignored when diffing.
- `recommendation` and `evaluation` have side effects (write Report row + upload PDF to S3).
  Only run `capture` against the testing environment intentionally.
- Test user: `06a83ece-5d1a-470b-9c23-fd1c8bdbd8c7` (satish.bagali@gmail.com).
  This user is also an admin — used for all admin endpoints.
- Run context: **Vietnam** (`6c2a0573-…`). Feeds are country-scoped.

## When `rationsmart/` is bootstrapped (Phase 1)

Copy this whole folder into the new repo as `rationsmart/tests/refactoring/`. The golden
files do not change; only the `--base-url` you compare against changes.

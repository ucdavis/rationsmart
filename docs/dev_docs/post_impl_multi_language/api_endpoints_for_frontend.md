# RationSmart Multi-Language — API Reference for Frontend

All endpoints use the base prefix `/v1`. Admin endpoints require an admin JWT. User endpoints
require a standard authenticated JWT unless stated otherwise.

---

## 1. Auth Endpoints (Changed)

### 1.1 `GET /v1/auth/countries`

**Objective:** Returns all active countries the user can select during registration or country
switching. Now includes the list of language codes that are active for each country.

**Request:** No body. No query params required.

**Response (changed field):**
```json
[
  {
    "id": "uuid",
    "name": "India",
    "country_code": "IND",
    "currency": "INR",
    "is_active": true,
    "supported_languages": ["en", "hi"]
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `supported_languages` | `List[string]` | Language codes active for this country. Always includes `"en"`. |

**How Frontend uses it:**
- After the user selects a country, read `supported_languages` from that country object.
- Use this list to populate the language selector (e.g., in the profile settings screen).
- If `supported_languages` has only `["en"]`, the language selector can be hidden.

---

### 1.2 `GET /v1/auth/user/{email_id}`

**Objective:** Fetch the authenticated user's profile. Now includes the user's saved language
preference.

**Response (changed field):**
```json
{
  "id": "uuid",
  "name": "Ravi Kumar",
  "email_id": "ravi@example.com",
  "country_id": "uuid",
  "preferred_language": "hi"
}
```

| Field | Type | Notes |
|---|---|---|
| `preferred_language` | `string` | BCP 47 code. Defaults to `"en"`. |

**How Frontend uses it:**
- On login / app load, read `preferred_language` and set it as the active locale in the UI.
- Pass this value as the `?lang=` query param on all subsequent feed/animal API calls.

---

### 1.3 `PUT /v1/auth/user/{email_id}`

**Objective:** Update user profile fields, including language preference.

**Request body (changed field):**
```json
{
  "name": "Ravi Kumar",
  "preferred_language": "hi"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `preferred_language` | `string` | Optional | Must be an active language code supported by the user's country. Returns `400` if invalid. |

**Response:** Same as `GET /v1/auth/user/{email_id}` above.

**How Frontend uses it:**
- Call this when the user saves their language preference in the profile/settings screen.
- Update the locally cached locale to match `preferred_language` in the response.

---

## 2. Feed / Animal Endpoints (All accept `?lang=`)

Every endpoint below now accepts an optional `?lang=` query parameter. If omitted, the server
falls back to the authenticated user's `preferred_language`, then to English.

### Language resolution order (server-side):
1. `?lang=<code>` query param (if supplied and active)
2. `user.preferred_language` (from the authenticated user record)
3. `"en"` (implicit fallback — always returns a value)

### 2.1 `GET /v1/animal/unique-feed-type/{country_id}?lang=`

**Objective:** Returns the distinct feed types available for a country, translated into the
requested language.

**Query params:**
| Param | Type | Required | Notes |
|---|---|---|---|
| `lang` | `string` | Optional | e.g., `hi`, `vi`. Defaults per resolution order above. |

**Response:**
```json
{
  "success": true,
  "feed_types": ["चारा", "अनाज", "प्रोटीन"]
}
```
*Values are the translated display strings; they are NOT feed type IDs.*

**How Frontend uses it:**
- Use translated strings directly in filter dropdowns and labels.
- When passing a selected type back to the server (e.g., in a feed search), pass the original
  English value, not the translated one — or rely on the backend to resolve via the same
  translation layer.

---

### 2.2 `GET /v1/animal/unique-feed-category?lang=`

**Objective:** Returns the distinct feed categories for the user's country, translated.

**Query params:** Same as 2.1 (`lang` optional, `country_id` required).

**Response:**
```json
{
  "success": true,
  "feed_categories": ["घास", "अनाज"]
}
```

---

### 2.3 `GET /v1/animal/search-feeds?query=&country_id=&lang=`

**Objective:** Typeahead / autocomplete search across feed names. Returns translated display
names.

**Query params:**
| Param | Type | Required |
|---|---|---|
| `query` | `string` | Yes |
| `country_id` | `uuid` | Yes |
| `lang` | `string` | Optional |

**Response (changed fields):**
```json
{
  "success": true,
  "feeds": [
    {
      "id": "uuid",
      "fd_code": "F001",
      "fd_name": "Napier Grass",
      "display_name": "नेपियर घास",
      "display_type": "चारा",
      "display_category": "घास"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `fd_name` | `string` | Original English name — stable, use for API calls. |
| `display_name` | `string` | Translated name for display. Falls back to `fd_name` if no translation. |
| `display_type` | `string` | Translated type for display. |
| `display_category` | `string` | Translated category for display. |

**How Frontend uses it:**
- Show `display_name` in the autocomplete list.
- When the user picks a feed, use `id` or `fd_code` to pass back to the server — never rely on
  the translated string as an identifier.

---

### 2.4 `GET /v1/animal/feed-name/{country_id}?lang=`

**Objective:** List feed names filtered by country, type, and category. Used to populate
ingredient selector dropdowns.

**Query params:**
| Param | Type | Required |
|---|---|---|
| `country_id` | `uuid` | Yes |
| `feed_type` | `string` | Optional |
| `category` | `string` | Optional |
| `lang` | `string` | Optional |

**Response:** Same `display_name`, `display_type`, `display_category` structure as 2.3.

---

### 2.5 `GET /v1/animal/feeds?country_id=&lang=`

**Objective:** List all feeds for a country with translated display fields.

**Response item:**
```json
{
  "id": "uuid",
  "fd_code": "F001",
  "fd_name": "Napier Grass",
  "display_name": "नेपियर घास",
  "display_type": "चारा",
  "display_category": "घास"
}
```

---

### 2.6 `GET /v1/animal/feeds/{country_id}/{feed_id}?lang=`

**Objective:** Get a single feed by ID with translated fields.

**Response:** Same structure as a single item in 2.5.

---

### 2.7 `GET /v1/animal/feed-details/{feed_id}?lang=`

**Objective:** Full nutritional profile of a feed, with translated display fields appended.

**Response (changed fields appended to existing nutritional fields):**
```json
{
  "id": "uuid",
  "fd_name": "Napier Grass",
  "display_name": "नेपियर घास",
  "display_type": "चारा",
  "display_category": "घास",
  "dm": 18.5,
  "cp": 8.2
}
```

---

## 3. Admin — Translation Workbook Endpoints

These endpoints are used by country administrators to manage bulk translations via Excel workbooks.

### 3.1 `GET /v1/admin/translations/workbook?country_id=<uuid>`

**Objective:** Download a pre-filled Excel workbook for translating feed data for a country.
The workbook has 3 sheets: **Feeds**, **Feed Types**, and **Feed Categories**.

**Query params:**
| Param | Type | Required |
|---|---|---|
| `country_id` | `uuid` | Yes |

**Response:** Binary file download.
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="translations_<country_id>.xlsx"`

**Workbook structure (Feeds sheet):**
| feed_id | fd_code | english_name | hi | vi | ... |
|---|---|---|---|---|---|
| uuid | F001 | Napier Grass | नेपियर घास | (empty) | |

- `feed_id`, `fd_code`, `english_name` are read-only reference columns.
- Language columns (e.g., `hi`, `vi`) are to be filled by the translator.

**Feed Types / Feed Categories sheets:**
| english_value | hi | vi | ... |
|---|---|---|---|
| Forage | चारा | (empty) | |

**How Frontend uses it:**
- Provide a "Download Translation Template" button that triggers this endpoint.
- The browser will receive and save the `.xlsx` file.

---

### 3.2 `POST /v1/admin/translations/workbook?country_id=<uuid>`

**Objective:** Upload a filled-in workbook to bulk-import translations for a country.

**Request:**
- Content-Type: `multipart/form-data`
- Form field: `file` (the `.xlsx` file)

**Response:**
```json
{
  "success": true,
  "message": "Workbook imported successfully",
  "feeds_inserted": 12,
  "feeds_updated": 3,
  "feeds_skipped": 1,
  "types_inserted": 5,
  "types_updated": 0,
  "types_skipped": 0,
  "categories_inserted": 4,
  "categories_updated": 0,
  "categories_skipped": 0,
  "errors": ["Row 5: feed_id abc123 not found in country"]
}
```

| Field | Type | Notes |
|---|---|---|
| `feeds_inserted` | `int` | Net-new translation rows created. |
| `feeds_updated` | `int` | Existing rows updated with new text. |
| `feeds_skipped` | `int` | Rows with empty translation or invalid feed_id. |
| `errors` | `List[string]` | Per-row problems — does not abort the import. |

**How Frontend uses it:**
- Provide a file upload + "Import" button.
- Show the summary counts and errors in a results panel after upload.

---

### 3.3 `GET /v1/admin/translations/coverage?country_id=<uuid>&lang=<code>`

**Objective:** Check how complete the translations are for a given language in a country.
Useful for showing a "translation progress" percentage.

**Query params:**
| Param | Type | Required |
|---|---|---|
| `country_id` | `uuid` | Yes |
| `lang` | `string` | Yes |

**Response:**
```json
{
  "success": true,
  "country_id": "uuid",
  "language": "hi",
  "total_feeds": 50,
  "translated_feeds": 43,
  "missing_feeds": 7,
  "total_types": 6,
  "translated_types": 6,
  "total_categories": 8,
  "translated_categories": 5
}
```

**How Frontend uses it:**
- Display a progress bar or percentage (e.g., `translated_feeds / total_feeds * 100`).
- Highlight untranslated items to guide the admin.

---

### 3.4 `POST /v1/admin/translations`

**Objective:** Insert or update a single feed name translation.

**Request body:**
```json
{
  "feed_id": "uuid",
  "language": "hi",
  "name": "नेपियर घास"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `feed_id` | `uuid string` | Yes | |
| `language` | `string` | Yes | Max 10 chars. Cannot be `"en"`. |
| `name` | `string` | Yes | 1–500 chars. |

**Response:**
```json
{
  "feed_id": "uuid",
  "language": "hi",
  "name": "नेपियर घास",
  "action": "inserted",
  "created_at": "2026-01-15T10:30:00Z",
  "updated_at": "2026-01-15T10:30:00Z"
}
```

`action` is `"inserted"` or `"updated"`.

---

### 3.5 `GET /v1/admin/translations/{feed_id}`

**Objective:** Retrieve all translations that exist for a specific feed, across all languages.

**Path param:** `feed_id` (UUID string).

**Response:**
```json
{
  "success": true,
  "feed_id": "uuid",
  "translations": [
    {"feed_id": "uuid", "language": "hi", "name": "नेपियर घास", "action": null, "created_at": "...", "updated_at": "..."},
    {"feed_id": "uuid", "language": "vi", "name": "Cỏ Napier", "action": null, "created_at": "...", "updated_at": "..."}
  ]
}
```

**How Frontend uses it:**
- Populate a per-feed translation editor panel.

---

### 3.6 `DELETE /v1/admin/translations/{feed_id}/{language}`

**Objective:** Remove the translation for a specific language from a feed.

**Path params:** `feed_id` (UUID), `language` (code string).

**Response:**
```json
{"success": true, "message": "Translation deleted"}
```

Returns `{"success": false, "message": "Translation not found"}` if none exists.

---

## 4. Admin — Language Management Endpoints

### 4.1 `POST /v1/admin/languages`

**Objective:** Register a new language in the system. The language becomes available globally
but is not assigned to any country until explicitly assigned.

**Request body:**
```json
{"code": "sw", "name": "Swahili"}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | `string` | Yes | BCP 47, max 10 chars. Normalised to lowercase automatically. |
| `name` | `string` | Yes | Display name, max 100 chars. |

**Response (HTTP 201):**
```json
{
  "code": "sw",
  "name": "Swahili",
  "is_active": true,
  "created_at": "2026-01-15T10:30:00Z"
}
```

Returns `409 Conflict` if the code already exists.

---

### 4.2 `GET /v1/admin/languages`

**Objective:** List all languages registered in the system.

**Response:**
```json
{
  "success": true,
  "languages": [
    {"code": "en", "name": "English", "is_active": true, "created_at": "..."},
    {"code": "hi", "name": "Hindi", "is_active": true, "created_at": "..."},
    {"code": "vi", "name": "Vietnamese", "is_active": true, "created_at": "..."}
  ]
}
```

**How Frontend uses it:**
- Populate the global language admin list in the super-admin panel.

---

### 4.3 `PATCH /v1/admin/languages/{code}`

**Objective:** Update a language's display name or active status.

**Path param:** `code` (e.g., `hi`).

**Request body (at least one field required):**
```json
{"name": "हिन्दी", "is_active": true}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | Optional | New display name. |
| `is_active` | `boolean` | Optional | Set `false` to deactivate globally. |

**Response:** Same as `LanguageResponse` in 4.1.

Returns `404` if `code` not found. Returns `400` if neither field provided.

**Note:** Deactivating a language removes it from the `?lang=` resolution pool immediately
(Redis cache is invalidated). Existing translations are preserved.

---

### 4.4 `GET /v1/admin/countries`

**Objective:** List all active countries along with their currently assigned language codes.

**Response:**
```json
{
  "success": true,
  "countries": [
    {
      "id": "uuid",
      "name": "India",
      "country_code": "IND",
      "currency": "INR",
      "is_active": true,
      "languages": ["en", "hi"]
    }
  ]
}
```

**How Frontend uses it:**
- Drive the country-language assignment matrix in the admin panel.

---

### 4.5 `POST /v1/admin/countries/{country_id}/languages/{code}`

**Objective:** Assign an existing language to a country, making it available to users of that
country.

**Path params:** `country_id` (UUID), `code` (language code).

**Response (HTTP 201):**
```json
{"success": true, "message": "Language 'hi' assigned to country"}
```

- Returns `404` if the language code does not exist.
- Returns `409` if already assigned.

---

### 4.6 `DELETE /v1/admin/countries/{country_id}/languages/{code}`

**Objective:** Remove a language assignment from a country.

**Path params:** `country_id` (UUID), `code` (language code).

**Response:**
```json
{"success": true, "message": "Language 'hi' unassigned from country"}
```

- Returns `400` if `code == "en"` — English cannot be removed from any country.
- Returns `404` if the assignment does not exist.

---

## 5. Frontend Integration Patterns

### Setting the `?lang=` parameter

The recommended approach is to read `preferred_language` from the user profile at login, store it
in app state, and append it to every feed API call:

```
GET /v1/animal/feeds?country_id=<id>&lang=hi
GET /v1/animal/feed-details/<id>?lang=hi
GET /v1/animal/search-feeds?query=grass&country_id=<id>&lang=hi
```

If the user changes their language in settings, call `PUT /v1/auth/user/{email_id}` to persist
the preference, then update the app state locale.

### Display vs. identity fields

Always use `display_*` fields for rendering to the user. Always use `id`, `fd_code`, or
`fd_name` (the stable English name) when referencing a feed in API calls or stored state. Never
use a translated string as an identifier.

### English is always available

If no translation exists for a feed name, type, or category in the requested language, the
server returns the English value. The frontend will never receive a blank display field.

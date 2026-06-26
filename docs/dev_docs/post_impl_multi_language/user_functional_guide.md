# RationSmart Multi-Language Support — User Guide

## What Is Multi-Language Support?

RationSmart now displays feed names, feed types, and feed categories in the local language of
your choice — so that livestock advisors, field officers, and farmers can work comfortably in
their own language without relying on English terminology for every ingredient and category.

---

## What Gets Translated?

The following content is shown in your selected language (when translations are available for
your country):

| Content | Example (English → Hindi) |
|---|---|
| Feed names | Napier Grass → नेपियर घास |
| Feed types | Forage → चारा |
| Feed categories | Grass → घास |

The rest of the application — menus, buttons, advisory text, report headings — is not affected
by this setting in the current release.

---

## How Do I Select My Language?

1. Open your **Profile** or **Settings** screen.
2. Look for the **Language** option (visible only if your country has more than one language
   enabled).
3. Choose your preferred language from the list.
4. Save the profile. The feed lists, search results, and ingredient details will now appear in
   the language you selected.

Your language choice is saved to your account, so it will be active the next time you log in on
any device.

---

## Which Languages Are Available?

The languages available to you depend on which country your account is linked to. Your country
administrator decides which languages are active for your country.

- English (`en`) is always available and is the default.
- Other languages (e.g., Hindi, Vietnamese) appear in the selector only if your country
  administrator has enabled them.

If you do not see a language you need, ask your country administrator to enable it.

---

## What If a Translation Is Missing?

Not every feed name or category may have been translated yet. In that case, RationSmart
automatically shows the English name as a fallback. You will never see a blank or broken label —
the English name is always there as a safety net.

---

## Diet Recommendations and Reports

The diet optimization and evaluation features work the same way regardless of language. When
your diet results show feed ingredient names, they will appear in your preferred language where
translations exist, falling back to English otherwise.

---

## For Country Administrators — Managing Translations

If you are a country administrator, you can manage translations for your country through the
admin panel.

### Enabling a Language for Your Country

1. Ask a super-admin to create the language in the system (if it does not exist yet).
2. In the admin panel, go to **Countries → Languages**.
3. Find your country and click **Add Language**.
4. Select the language code and confirm.

Users in your country will immediately see the new language in their profile settings.

### Adding Translations (Excel Workbook Method)

1. Go to **Admin → Translations** and click **Download Translation Template** for your country.
2. Open the downloaded `.xlsx` file. It contains three sheets:
   - **Feeds** — one row per feed with its English name and a column for each active language.
   - **Feed Types** — unique feed type values and their translation columns.
   - **Feed Categories** — unique category values and their translation columns.
3. Fill in the translation columns for each row. Leave a cell empty if no translation is
   available yet — the system will fall back to English.
4. Save the file and upload it back via **Admin → Translations → Import Workbook**.
5. The import summary will show how many rows were inserted, updated, or skipped, and any errors.

### Adding or Editing a Single Translation

In **Admin → Translations**, search for a feed and edit its translation for any language
directly in the panel without downloading the workbook.

### Checking Translation Completeness

In **Admin → Translations → Coverage**, select a country and a language to see:
- How many feeds have been translated vs. how many are missing.
- Same breakdown for feed types and categories.

Use this to track progress and prioritise which translations to complete next.

---

## Frequently Asked Questions

**Q: Can I switch languages mid-session?**
Yes. Update your language preference in Profile settings at any time.

**Q: Does language affect my diet results or calculations?**
No. The nutritional calculations are the same in all languages. Only the names shown to you
change.

**Q: What happens if I set a language that my country no longer supports?**
The server falls back to English automatically. Your profile preference is preserved; it will
work again if the language is re-enabled.

**Q: Can two users in the same country use different languages?**
Yes. Each user has an individual language preference. Two advisors in the same country can work
in different languages simultaneously.

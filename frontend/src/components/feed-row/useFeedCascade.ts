"use client";

// FeedRow's three-step dropdown cascade — Feed Type → Feed Category → Feed —
// with its option lists and loading flags. Split out of FeedRow.tsx (audit
// B-17); the behaviour, including CLAUDE.md §10.10 (fetch new options first,
// then clear a downstream value only if it's no longer offered) and the
// stale non-English identity self-heal, is unchanged.
import { useEffect, useState } from "react";
import {
  getFeedCategories,
  getFeedSubCategories,
  getFeedTypes,
  parseFeedCategoryOptions,
  parseFeedTypeOptions,
  type FeedItem,
  type FeedTaxonomyLabels,
} from "@/lib/api";
import { isForageType, isRoughageType } from "@/lib/feed-type-aliases";
import { useLatestRef } from "@/lib/use-latest";
import type { User } from "@/lib/store";

export interface FeedType {
  id: number;
  name: string;
  display: string;
}
export interface FeedCategory {
  id: number;
  name: string;
  display: string;
}
// display_name is the translated label shown to the user; feed_name is the
// stable English identifier used for backend lookups and comparison against
// the row's stored sub_category_name.
export interface FeedSubCategoryItem {
  feed_name: string;
  feed_uuid: string;
  display_name: string;
}

interface CascadeArgs {
  item: FeedItem;
  user: User | null;
  onUpdate: (id: string, updates: Partial<FeedItem>) => void;
  showSnackbar: (message: string, type?: "success" | "error" | "info") => void;
  t: (source: string) => string;
  taxonomyLabels?: FeedTaxonomyLabels;
}

export function useFeedCascade({
  item,
  user,
  onUpdate,
  showSnackbar,
  t,
  taxonomyLabels,
}: CascadeArgs) {
  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [categories, setCategories] = useState<FeedCategory[]>([]);
  const [subCategories, setSubCategories] = useState<FeedSubCategoryItem[]>([]);

  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // The types fetch runs when the user / country changes; the row, its
  // onUpdate and the translator are read at resolve time through a ref, so
  // a slow response acts on the row as it is now, not as it was (audit B-20).
  const latest = useLatestRef({ item, onUpdate, t });
  useEffect(() => {
    if (!user?.country_id || !user?.id) {
      // Nothing to fetch — clear the initial `true`, otherwise the row
      // reports "loading" forever and keeps Generate disabled (audit B-03).
      setLoadingTypes(false);
      return;
    }
    setLoadingTypes(true);
    // Race protection: if user or country changes while the request is
    // in flight, the previous fetch's .then must NOT overwrite the new
    // fetch's result. Cleanup runs before re-fire.
    let cancelled = false;
    // Response-shape helper. Returns identity + display for each option.
    // Backend shapes handled:
    //   1. Array of strings                     → identity == display (no translation)
    //   2. Array of {type_name, display_type}   → identity = type_name, display = display_type
    //   3. Array of {name, display_name}        → identity = name, display = display_name
    // Falls back to identity when display isn't present.
    const extractOptions = parseFeedTypeOptions;

    // i18n V2 — single fetch with ?lang=. Backend returns objects with
    // both identity (type_name) and localized (display_type) fields.
    // We keep the English identity for storage / downstream API calls
    // and use display_type only for the visible label.
    getFeedTypes(user.country_id, user.id)
      .then((res) => {
        if (cancelled) return;
        // The fetch itself already succeeded by this point — anything
        // that throws below is a parsing/shape problem, not a load
        // failure, so it must NOT surface the misleading "Could not load
        // feed types" toast (that's reserved for the .catch() below,
        // which only fires on an actual failed request).
        try {
          const opts = extractOptions(res.data);
          // Forage / Roughage always first, regardless of active language.
          // The alias helpers accept the translated identity strings the
          // backend returns when ?lang= is set (e.g. "चारा" ↔ "Forage").
          const sorted = [
            ...opts.filter((o) => isForageType(o.name) || isRoughageType(o.name)),
            ...opts.filter((o) => !isForageType(o.name) && !isRoughageType(o.name)),
          ];
          // English identity in `display` is fine as a fallback — the
          // parent-provided taxonomyLabels dict is applied at render time
          // below (radios / category dropdown), so localization stays
          // reactive when the dict arrives after the cascade has already
          // populated the state.
          const types = sorted.map((o, i) => ({
            id: i + 1,
            name: o.name,
            display: o.display,
          }));
          // Stale-identity remap. If the row was persisted while an
          // earlier build was sending ?lang= to unique-feed-type, the
          // stored feed_type_name is a translated string like "चारा".
          // Match it against the known-alias sets and rewrite state to
          // the English identity we now fetch. Prevents a phantom
          // "extra radio" from being synthetically inserted below.
          if (
            latest.current.item.feed_type_name &&
            !types.find((t) => t.name === latest.current.item.feed_type_name)
          ) {
            if (
              isForageType(latest.current.item.feed_type_name) &&
              types.find((t) => t.name === "Forage")
            ) {
              latest.current.onUpdate(latest.current.item.id, { feed_type_name: "Forage" });
            } else if (
              isRoughageType(latest.current.item.feed_type_name) &&
              types.find((t) => t.name === "Roughage")
            ) {
              latest.current.onUpdate(latest.current.item.id, { feed_type_name: "Roughage" });
            } else if (/[^\x00-\x7F]/.test(latest.current.item.feed_type_name)) {
              // Non-ASCII stored identity that isn't a known Forage/Roughage
              // alias — this endpoint is English-only now (see getFeedTypes
              // above), so any non-Latin string here can only be a
              // translated value baked in as identity by the historical
              // ?lang= bug, for a type we don't have a static alias for
              // (only Forage/Roughage are aliased — see
              // feed-type-aliases.ts). Reverse-looking-up against
              // taxonomyLabels only works when the CURRENT active language
              // happens to match the corruption's language, which usually
              // isn't true (e.g. row corrupted in Hindi, user now on
              // English) — so injecting it verbatim would permanently show
              // foreign-script text in the radio group no matter what
              // language is picked. Clear the row's feed selection instead;
              // the freshly-fetched (English) options are still valid to
              // re-pick from.
              latest.current.onUpdate(latest.current.item.id, {
                feed_type_id: null,
                feed_type_name: "",
                category_id: null,
                category_name: "",
                sub_category_id: null,
                sub_category_name: "",
                feed_uuid: null,
              });
            } else {
              // Genuinely-unknown stored value (e.g. country changed and
              // the previous country's type isn't valid here). Inject a
              // synthetic entry so the row still renders its stored
              // label instead of falling to an empty selection.
              types.unshift({
                id: latest.current.item.feed_type_id ?? -1,
                name: latest.current.item.feed_type_name,
                display: latest.current.item.feed_type_name,
              });
            }
          }
          setFeedTypes(types);
          if (latest.current.item.feed_type_name) {
            const match = types.find((t) => t.name === latest.current.item.feed_type_name);
            if (match && match.id !== latest.current.item.feed_type_id) {
              latest.current.onUpdate(latest.current.item.id, { feed_type_id: match.id });
            }
          }
        } catch (parseErr) {
          console.error(
            "[feed-cascade] feed types response parsing failed (request itself succeeded):",
            parseErr
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[feed-cascade] feed types fetch failed:", err?.message);
        if (!latest.current.item.feed_type_name)
          showSnackbar(latest.current.t("Could not load feed types"), "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingTypes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.country_id, user?.id, showSnackbar, latest]);

  // Self-heal — an earlier i18n build briefly sent ?lang= to
  // unique-feed-type, which stored the TRANSLATED string (e.g. "चारा")
  // as feed_type_name instead of the English identity (see the long
  // comment on getFeedTypes in api.ts). Rows saved during that window
  // are stuck: the type list above is always English now, never
  // matches, and the fallback path re-injects the stored translated
  // string as a synthetic option every render — the radio group shows
  // Hindi forever, independent of the active language, and survives
  // hard refresh because it's baked into persisted feedSelections.
  // Once taxonomyLabels (English → active-language dict) arrives,
  // reverse-look-up the stored value against it and rewrite feed_type_name
  // to the recovered English identity. Runs whenever the fetched types
  // list or the label dict changes, so it fires as soon as both are
  // available regardless of which resolved first.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs1 = useLatestRef({ item, onUpdate });
  useEffect(() => {
    const { item, onUpdate } = effectInputs1.current;
    if (!item.feed_type_name || !taxonomyLabels?.types) return;
    if (feedTypes.some((ft) => ft.name === item.feed_type_name)) return;
    const englishKey = Object.entries(taxonomyLabels.types).find(
      ([, v]) => v === item.feed_type_name
    )?.[0];
    if (englishKey && feedTypes.some((ft) => ft.name === englishKey)) {
      onUpdate(item.id, { feed_type_name: englishKey });
    }
  }, [item.feed_type_name, feedTypes, taxonomyLabels, effectInputs1]);

  // Categories cascade. We defer the reset until AFTER fetching the new
  // list and only clear category_name/sub_category if the stored values
  // are not in the freshly loaded options — that way simulation-history
  // restoration keeps its values, while a user-driven type change still
  // wipes downstream selections.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs2 = useLatestRef({ item, onUpdate, showSnackbar, t });
  useEffect(() => {
    const { item, onUpdate, showSnackbar, t } = effectInputs2.current;
    if (!item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingCats(true);
    // Race protection — see the types-cascade useEffect above. Without
    // this, rapidly switching feed type can leave categories from the
    // previous type stuck in the dropdown (the slower request wins).
    let cancelled = false;
    // Same shape rules as the types extractor above. Backend now
    // returns objects with both category_name (identity) and
    // display_category (localized label). Falls back to bare-string
    // rows for backwards compat.
    const extractCatOptions = parseFeedCategoryOptions;

    // i18n V2 — single fetch with ?lang= (see api.ts getFeedCategories).
    // Response provides both category_name (identity for comparison /
    // downstream calls) and display_category (visible label).
    getFeedCategories(item.feed_type_name, user.country_id, user.id)
      .then((res) => {
        if (cancelled) return;
        // The fetch itself already succeeded here — anything that throws
        // below is a parsing/shape problem, not a load failure, so it
        // must NOT surface the misleading "Could not load categories"
        // toast (reserved for the .catch() below on an actual failed
        // request).
        try {
          const opts = extractCatOptions(res.data);
          // Display is applied at render time from taxonomyLabels (same
          // reason as feed types above — the dict fetch can complete
          // after this cascade does).
          const newCats = opts.map((o, i) => ({
            id: i + 1,
            name: o.name,
            display: o.display,
          }));
          // Try exact match first, then a whitespace/case-insensitive
          // fallback so a stray trailing space or capitalisation difference
          // between /search-feeds and /unique-feed-category doesn't nuke
          // the row on remount.
          const norm = (s: string) => (s ?? "").trim().toLowerCase();
          const matched =
            newCats.find((c) => c.name === item.category_name) ??
            newCats.find((c) => norm(c.name) === norm(item.category_name));
          // Set when we inject a synthetic category option below, so the
          // !matched branch can SELECT it (dropdown value binds to
          // category_id — injecting the option isn't enough on its own).
          let syntheticCatId: number | null = null;
          // Non-ASCII stored category that doesn't match any freshly
          // fetched (English-only, see getFeedCategories) name — same
          // rationale as the feed-type stale-identity clear above. There's
          // no static alias table for categories (the vocabulary is much
          // larger than Forage/Roughage), so a foreign-script value here
          // can only be recovered if taxonomyLabels happens to already be
          // in the SAME language as the corruption (see the category
          // self-heal effect below this cascade) — otherwise it would
          // render as permanent foreign-script text. Clear rather than
          // inject verbatim.
          if (!matched && item.category_name && /[^\x00-\x7F]/.test(item.category_name)) {
            onUpdate(item.id, {
              category_id: null,
              category_name: "",
              sub_category_id: null,
              sub_category_name: "",
              feed_uuid: null,
            });
          } else if (
            !matched &&
            item.category_name &&
            (item.feed_uuid || item.category_id != null)
          ) {
            // The row's stored category isn't in the fetched list but the
            // row has been actively used (feed picked, or a nav round-trip).
            // Inject a synthetic option so the CustomSelect can render the
            // picked feed's category. Common cause: /search-feeds reports a
            // category (e.g. "By-Product/Other-Forage") that
            // /unique-feed-category doesn't return for that feed type — a
            // backend inconsistency — leaving the fetched list without it.
            syntheticCatId = item.category_id ?? -1;
            newCats.unshift({
              id: syntheticCatId,
              name: item.category_name,
              display: item.category_name,
            });
          }
          setCategories(newCats);
          if (!matched) {
            // Only wipe when the row has NO feed_uuid to lean on. Once the
            // user has actively picked a feed (feed_uuid set), that pick
            // is the source of truth — treat a name mismatch here as a
            // list-caching quirk, not a reason to discard their selection.
            // Fixes: nav Cattle Info → back → forward would empty Feed 1
            // even though feedSelections had the row cached in the store,
            // because a name-only cascade mismatch cleared everything.
            if (!item.feed_uuid) {
              onUpdate(item.id, {
                category_id: null,
                category_name: "",
                sub_category_id: null,
                sub_category_name: "",
                feed_uuid: null,
              });
              setSubCategories([]);
            } else if (syntheticCatId != null && item.category_id !== syntheticCatId) {
              // SELECT the injected synthetic option. The Category dropdown
              // binds its value to category_id, so injecting the option
              // isn't enough — without setting category_id the picked feed's
              // category renders as a blank "Select" placeholder.
              onUpdate(item.id, { category_id: syntheticCatId });
            }
          } else if (matched.id !== item.category_id) {
            onUpdate(item.id, { category_id: matched.id });
          }
        } catch (parseErr) {
          console.error(
            "[feed-cascade] feed categories response parsing failed (request itself succeeded):",
            parseErr
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[feed-cascade] feed categories fetch failed:", err?.message);
        if (!item.category_name) showSnackbar(t("Could not load categories"), "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingCats(false);
      });
    return () => {
      cancelled = true;
    };
    // NOTE: category_name is a dep too. A search pick can set category_name
    // WITHOUT changing feed_type_name (e.g. FEED 1 is already "Forage" and the
    // user picks another Forage feed). Keying only off feed_type_name meant
    // the cascade never re-ran, so category_id was never resolved and the
    // Feed Category field stayed blank until a page refresh remounted the row.
    // Re-running on category_name change matches (or injects+selects) the new
    // category. The cascade only ever SETS category_id (never category_name),
    // so this doesn't re-trigger itself.
  }, [item.feed_type_name, item.category_name, user?.country_id, user?.id, effectInputs2]);

  // Self-heal for category_name — same rationale as the feed_type_name
  // self-heal effect above. A row saved while unique-feed-category was
  // briefly sending ?lang= has a translated string baked in as its
  // "identity"; recover the English key via taxonomyLabels once it's
  // available.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs3 = useLatestRef({ item, onUpdate });
  useEffect(() => {
    const { item, onUpdate } = effectInputs3.current;
    if (!item.category_name || !taxonomyLabels?.categories) return;
    if (categories.some((c) => c.name === item.category_name)) return;
    const englishKey = Object.entries(taxonomyLabels.categories).find(
      ([, v]) => v === item.category_name
    )?.[0];
    if (englishKey && categories.some((c) => c.name === englishKey)) {
      onUpdate(item.id, { category_name: englishKey });
    }
  }, [item.category_name, categories, taxonomyLabels, effectInputs3]);

  // Sub-categories cascade. Same pattern — only reset feed_uuid if the
  // previously stored uuid isn't present in the freshly loaded list.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs4 = useLatestRef({ item, onUpdate, showSnackbar, t });
  useEffect(() => {
    const { item, onUpdate, showSnackbar, t } = effectInputs4.current;
    if (!item.category_name || !item.feed_type_name || !user?.country_id || !user?.id) return;
    setLoadingSubs(true);
    // Race protection — see types-cascade above
    let cancelled = false;
    getFeedSubCategories(item.feed_type_name, item.category_name, user.country_id, user.id)
      .then((res) => {
        if (cancelled) return;
        // The fetch itself already succeeded here — anything that throws
        // below is a parsing/shape problem, not a load failure, so it
        // must NOT surface the misleading "Could not load sub-categories"
        // toast (reserved for the .catch() below on an actual failed
        // request).
        try {
          // v1 /v1/animal/feed-name response (per swagger description):
          //   { standard_feeds: [...], custom_feeds: [...] }
          // Each item is a FeedDetailsResponse: { feed_id, fd_name, fd_type,
          // fd_category, ... } — i.e. the UUID is `feed_id` (was `feed_uuid`
          // on legacy) and the display name is `fd_name` (was `feed_name`).
          // Defensive: also accept legacy bare array / sub_categories /
          // feeds wrappers and the older feed_uuid / feed_name keys, so a
          // shape regression doesn't break the dropdown.
          const data = res.data as unknown;
          const standardFeeds = (data as { standard_feeds?: unknown[] })?.standard_feeds;
          const customFeeds = (data as { custom_feeds?: unknown[] })?.custom_feeds;
          const raw: unknown[] =
            Array.isArray(standardFeeds) || Array.isArray(customFeeds)
              ? [
                  ...(Array.isArray(standardFeeds) ? standardFeeds : []),
                  ...(Array.isArray(customFeeds) ? customFeeds : []),
                ]
              : Array.isArray(data)
                ? data
                : Array.isArray((data as { sub_categories?: unknown[] })?.sub_categories)
                  ? (data as { sub_categories: unknown[] }).sub_categories
                  : Array.isArray((data as { feeds?: unknown[] })?.feeds)
                    ? (data as { feeds: unknown[] }).feeds
                    : // A single matching feed can come back as a bare object
                      // instead of a 1-item array — wrap it instead of
                      // rendering an empty Feed dropdown for a feed that
                      // genuinely exists.
                      data &&
                        typeof data === "object" &&
                        !Array.isArray(data) &&
                        ("feed_id" in data || "fd_name" in data)
                      ? [data]
                      : [];
          const list: FeedSubCategoryItem[] = raw
            .map((it) => {
              const o = it as {
                feed_id?: string;
                feed_uuid?: string;
                id?: string;
                fd_name?: string;
                feed_name?: string;
                name?: string;
                display_name?: string;
              };
              const uuid = o?.feed_id ?? o?.feed_uuid ?? o?.id;
              const name = o?.fd_name ?? o?.feed_name ?? o?.name;
              // i18n V2 — display_name falls back to English name when no
              // translation exists, so we can render unconditionally.
              const display = o?.display_name ?? name;
              return uuid && name
                ? { feed_name: name, feed_uuid: uuid, display_name: display }
                : null;
            })
            .filter((s): s is FeedSubCategoryItem => s !== null);
          const match = list.find(
            (s) =>
              (item.feed_uuid && s.feed_uuid === item.feed_uuid) ||
              s.feed_name === item.sub_category_name
          );
          // If the row has a picked feed_uuid but it's not in the new
          // list (e.g. missing Hindi translation on backend), inject a
          // synthetic entry using the stored data so the dropdown can
          // STILL render the correct label. Without this the Feed
          // dropdown would visually go blank even though the state is
          // intact — the user perceives it as "everything reset".
          if (!match && item.feed_uuid && item.sub_category_name) {
            list.unshift({
              feed_uuid: item.feed_uuid,
              feed_name: item.sub_category_name,
              display_name: item.display_name ?? item.sub_category_name,
            });
          }
          setSubCategories(list);
          if (!match) {
            // Only wipe when the row has NO feed_uuid to lean on. When
            // feed_uuid IS set, the user actively picked this feed at
            // some point — treat a missing entry in the current cascade
            // response as a lang / translation gap on the backend side,
            // not a signal to discard the user's selection. Combined with
            // the synthetic-entry injection above, the dropdown keeps
            // rendering the correct label.
            if (!item.feed_uuid) {
              onUpdate(item.id, { sub_category_id: null, sub_category_name: "", feed_uuid: null });
            }
          } else if (
            match.feed_uuid !== item.feed_uuid ||
            match.feed_name !== item.sub_category_name
          ) {
            onUpdate(item.id, {
              sub_category_id: 1,
              sub_category_name: match.feed_name,
              feed_uuid: match.feed_uuid,
              // i18n V2 — persist the translated display name captured at
              // pick time. The report screen uses this as a fallback for
              // FeedBreakdown / CostEffectiveDiet cells when the backend's
              // diet endpoints don't yet return display_name themselves.
              display_name: match.display_name,
            });
          }
        } catch (parseErr) {
          console.error(
            "[feed-cascade] sub-categories response parsing failed (request itself succeeded):",
            parseErr
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[feed-cascade] sub-categories fetch failed:", err?.message);
        // If the row already has a restored sub_category_name / feed_uuid,
        // the visible state is intact — suppress the toast.
        if (!item.sub_category_name && !item.feed_uuid)
          showSnackbar(t("Could not load sub-categories"), "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingSubs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.category_name, item.feed_type_name, user?.country_id, user?.id, effectInputs4]);

  return {
    feedTypes,
    categories,
    subCategories,
    setSubCategories,
    loadingTypes,
    loadingCats,
    loadingSubs,
  };
}

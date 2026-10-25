"use client";

// Admin > Country/Language — split out of admin/country-language/page.tsx (audit B-17).

import { useEffect, useState } from "react";
import {
  downloadTranslationWorkbook,
  uploadTranslationWorkbook,
  getAdminFeeds,
  listFeedTranslations,
  upsertFeedTranslation,
  deleteFeedTranslation,
  labelForLanguage,
} from "@/lib/api";
import { contentDispositionOf, filenameFromContentDisposition, saveBlob } from "@/lib/download";
import { useEscapeKey } from "@/lib/use-escape";
import { allSettledLimited } from "@/lib/concurrency";
import { ADMIN_PAGE_SIZE } from "@/lib/pagination";
import { COLORS } from "@/lib/colors";
import { useLatestRef } from "@/lib/use-latest";
import {
  AdminFeedLite,
  CountryRow,
  FeedTranslation,
  SkeletonFeedRow,
  UploadSummary,
  cardStyle,
} from "./shared";
import TranslationCoverageCard from "./TranslationCoverageCard";
import { WorkbookCard } from "./WorkbookCard";
import { FeedNameEditSheet } from "./FeedNameEditSheet";
import { useT, fillText } from "@/lib/i18n-ui";
import { listFrom, numberField } from "@/lib/api-client/normalize";

export function FeedNamesTab({
  countries,
  showSnackbar,
}: {
  countries: CountryRow[];
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const [selCountry, setSelCountry] = useState<CountryRow | null>(null);
  const [selLang, setSelLang] = useState<string | null>(null);

  // Default to the first country (and its first local language) as soon as
  // the list loads, so the feed list is visible without an extra tap —
  // only when nothing has been picked yet, so it doesn't clobber the
  // admin's own selection on a later reload.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs2 = useLatestRef({ selCountry });
  useEffect(() => {
    const { selCountry } = effectInputs2.current;
    const first = countries[0];
    if (selCountry || !first) return;
    setSelCountry(first);
    setSelLang(first.languages.find((g) => g !== "en") ?? null);
  }, [countries, effectInputs2]);

  const [feeds, setFeeds] = useState<
    Array<AdminFeedLite & { translation?: FeedTranslation | null }>
  >([]);
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false);

  const [editingFeed, setEditingFeed] = useState<
    (AdminFeedLite & { translation?: FeedTranslation | null }) | null
  >(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  useEscapeKey(!!(editingFeed && !isSaving && !isDeleting), () => setEditingFeed(null));

  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const localLangs = selCountry ? selCountry.languages.filter((c) => c !== "en") : [];
  const showFeeds = !!selCountry && !!selLang && localLangs.includes(selLang);

  // Fetch every feed for the selected country (list-feeds is paginated,
  // capped at 100/page — walk every page), then hydrate each feed's
  // translation status for the selected language IN PARALLEL. No backend
  // endpoint returns "every feed + translation status" in one call.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs3 = useLatestRef({ selCountry, showSnackbar, t });
  useEffect(() => {
    const { selCountry, showSnackbar, t } = effectInputs3.current;
    if (!showFeeds || !selCountry || !selLang) {
      setFeeds([]);
      return;
    }
    let cancelled = false;
    setIsLoadingFeeds(true);
    (async () => {
      const all: AdminFeedLite[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await getAdminFeeds("", page, ADMIN_PAGE_SIZE, "", "", selCountry.name, "");
        all.push(...listFrom<AdminFeedLite>(res.data, "feeds"));
        totalPages = numberField(res.data, "total_pages") ?? 1;
        page += 1;
      } while (page <= totalPages);
      if (cancelled) return;
      setFeeds(all.map((f) => ({ ...f })));
      // One request per feed (no bulk endpoint) — capped at 6 in flight so a
      // large catalogue doesn't fire hundreds of requests at once.
      const results = await allSettledLimited(all, 6, (f) =>
        listFeedTranslations(f.feed_id).then((r) => ({
          feed_id: f.feed_id,
          translation:
            listFrom<FeedTranslation>(r.data, "translations").find((t) => t.language === selLang) ??
            null,
        }))
      );
      if (cancelled) return;
      const byId = new Map(
        results
          .filter((r) => r.status === "fulfilled")
          .map((r) => {
            const v = (
              r as PromiseFulfilledResult<{ feed_id: string; translation: FeedTranslation | null }>
            ).value;
            return [v.feed_id, v.translation];
          })
      );
      setFeeds((prev) => prev.map((f) => ({ ...f, translation: byId.get(f.feed_id) ?? null })));
    })()
      .catch(() => {
        if (!cancelled) showSnackbar(t("Could not load feeds"), "error");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFeeds(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selCountry?.id, selLang, showFeeds, effectInputs3]);

  const openFeedEdit = (f: AdminFeedLite & { translation?: FeedTranslation | null }) => {
    setEditingFeed(f);
    setEditValue(f.translation?.name ?? "");
  };

  const handleSaveFeed = async () => {
    if (!editingFeed || !selLang || !editValue.trim()) {
      showSnackbar(t("Enter a name first"), "error");
      return;
    }
    setIsSaving(true);
    try {
      const res = await upsertFeedTranslation({
        feed_id: editingFeed.feed_id,
        language: selLang,
        name: editValue.trim(),
      });
      const saved = res.data as FeedTranslation;
      setFeeds((prev) =>
        prev.map((f) => (f.feed_id === editingFeed.feed_id ? { ...f, translation: saved } : f))
      );
      showSnackbar(t("Saved ${feed}").replace("${feed}", editingFeed.fd_name), "success");
      setEditingFeed(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save name";
      showSnackbar(msg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFeed = async () => {
    if (!editingFeed || !selLang) return;
    setIsDeleting(true);
    try {
      await deleteFeedTranslation(editingFeed.feed_id, selLang);
      setFeeds((prev) =>
        prev.map((f) => (f.feed_id === editingFeed.feed_id ? { ...f, translation: null } : f))
      );
      showSnackbar(t("Name deleted"), "success");
      setEditingFeed(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete name";
      showSnackbar(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
    if (!selCountry) return;
    setIsDownloading(true);
    try {
      const res = await downloadTranslationWorkbook(selCountry.id);
      const fileName = filenameFromContentDisposition(
        contentDispositionOf(res.headers),
        `translations_${selCountry.id}.xlsx`
      );
      const blob = res.data as Blob;
      saveBlob(blob, fileName);
      showSnackbar(t("Downloaded ${file}").replace("${file}", fileName), "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not download workbook";
      showSnackbar(msg, "error");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!selCountry || !uploadFile) {
      showSnackbar(t("Pick a file to upload"), "error");
      return;
    }
    setIsUploading(true);
    setUploadSummary(null);
    try {
      const res = await uploadTranslationWorkbook(selCountry.id, uploadFile);
      setUploadSummary(res.data as UploadSummary);
      showSnackbar((res.data as UploadSummary)?.message ?? t("Workbook imported"), "success");
      setUploadFile(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Upload failed");
      showSnackbar(msg, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const doneCount = feeds.filter((f) => f.translation).length;

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-8 space-y-3">
      {/* 1 — Pick a country */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="px-4 py-3"
          style={{
            backgroundColor: COLORS.brightGrayNew,
            borderBottom: `1px solid ${COLORS.americanDiamond}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: COLORS.darkAquamarineGreen }}
          >
            {t("1 · Pick a country")}
          </p>
        </div>
        <div className="flex gap-2 px-4 py-3 overflow-x-auto">
          {countries.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelCountry(c);
                const first = c.languages.find((g) => g !== "en");
                setSelLang(first ?? null);
              }}
              className="flex-shrink-0 px-3 py-2 rounded-full text-sm font-bold whitespace-nowrap"
              style={{
                border:
                  selCountry?.id === c.id
                    ? `1.5px solid ${COLORS.darkAquamarineGreen}`
                    : `1.5px solid ${COLORS.gainsboro}`,
                backgroundColor:
                  selCountry?.id === c.id ? COLORS.darkAquamarineGreen : COLORS.white,
                color: selCountry?.id === c.id ? COLORS.white : COLORS.raisinBlack,
                cursor: "pointer",
              }}
            >
              {c.name}
            </button>
          ))}
          {countries.length === 0 && (
            <p className="text-sm" style={{ color: COLORS.darkSilver }}>
              {t("No countries enabled.")}
            </p>
          )}
        </div>
      </div>

      {/* 2 — Pick a language */}
      <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
        <div
          className="px-4 py-3"
          style={{
            backgroundColor: COLORS.brightGrayNew,
            borderBottom: `1px solid ${COLORS.americanDiamond}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: COLORS.darkAquamarineGreen }}
          >
            {t("2 · Pick a language")}
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {localLangs.map((code) => (
              <button
                key={code}
                onClick={() => setSelLang(code)}
                className="flex-shrink-0 px-3 py-2 rounded-full text-sm font-bold whitespace-nowrap"
                style={{
                  border:
                    selLang === code
                      ? `1.5px solid ${COLORS.darkAquamarineGreen}`
                      : `1.5px solid ${COLORS.gainsboro}`,
                  backgroundColor: selLang === code ? COLORS.darkAquamarineGreen : COLORS.white,
                  color: selLang === code ? COLORS.white : COLORS.raisinBlack,
                  cursor: "pointer",
                }}
              >
                {labelForLanguage(code)}
              </button>
            ))}
          </div>
          {selCountry && localLangs.length === 0 && (
            <p className="text-sm mt-1" style={{ color: COLORS.darkSilver, lineHeight: 1.5 }}>
              {t(
                "No local language is associated with this country yet — associate one on the Countries & Languages screen."
              )}
            </p>
          )}
        </div>
      </div>

      {/* 3 — Feed names */}
      {showFeeds && (
        <div className="bg-white rounded-2xl overflow-hidden" style={cardStyle}>
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{
              backgroundColor: COLORS.brightGrayNew,
              borderBottom: `1px solid ${COLORS.americanDiamond}`,
            }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wide flex-1"
              style={{ color: COLORS.darkAquamarineGreen }}
            >
              {fillText(t("3 · Feed names in ${language}"), {
                language: selLang ? labelForLanguage(selLang).toUpperCase() : "",
              })}
            </p>
            {!isLoadingFeeds && (
              <p className="text-xs" style={{ color: COLORS.darkSilver }}>
                {fillText(t("${done} of ${total} named"), { done: doneCount, total: feeds.length })}
              </p>
            )}
          </div>
          {isLoadingFeeds ? (
            <div>
              {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonFeedRow key={i} />
              ))}
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {feeds.map((f) => (
                <button
                  key={f.feed_id}
                  onClick={() => openFeedEdit(f)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{
                    borderTop: `1px solid ${COLORS.authenticWhite}`,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate" style={{ color: COLORS.raisinBlack }}>
                      {f.fd_name}
                    </p>
                    {f.translation && (
                      <p className="text-xs truncate" style={{ color: COLORS.crayolaGreen }}>
                        {f.translation.name}
                      </p>
                    )}
                  </div>
                  {!f.translation && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: "rgba(255,152,0,0.12)",
                        color: COLORS.webAmberText,
                      }}
                    >
                      {t("+ Add name")}
                    </span>
                  )}
                  <span style={{ color: COLORS.darkSilver }} aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <TranslationCoverageCard
        countryId={selCountry?.id ?? null}
        lang={selLang}
        showSnackbar={showSnackbar}
      />

      {/* Bulk upsert via workbook */}
      <WorkbookCard
        handleDownload={handleDownload}
        handleUpload={handleUpload}
        isDownloading={isDownloading}
        isUploading={isUploading}
        selCountry={selCountry}
        setUploadFile={setUploadFile}
        showSnackbar={showSnackbar}
        t={t}
        uploadFile={uploadFile}
        uploadSummary={uploadSummary}
      />

      {/* Feed edit sheet */}
      {editingFeed && selLang && (
        <FeedNameEditSheet
          editValue={editValue}
          editingFeed={editingFeed}
          handleDeleteFeed={handleDeleteFeed}
          handleSaveFeed={handleSaveFeed}
          isDeleting={isDeleting}
          isSaving={isSaving}
          selCountry={selCountry}
          selLang={selLang}
          setEditValue={setEditValue}
          setEditingFeed={setEditingFeed}
          t={t}
        />
      )}
    </div>
  );
}

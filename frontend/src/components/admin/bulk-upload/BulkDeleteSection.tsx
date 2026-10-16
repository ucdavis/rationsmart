"use client";

// Bulk Delete — third section of Admin > Bulk Upload / Download / Delete.
// Empties the whole standard feed library (feeds + feed translations) before
// a reload from CLIMDES. Red chrome so it reads as destructive, unlike the
// two sections above. Hidden unless the dry run succeeds (see useBulkDelete).

import Link from "next/link";
import { FEED_LIBRARY_CONFIRM_PHRASE } from "@/lib/api";
import { COLUMN_LEFT, COLUMN_WIDTH } from "@/lib/column";
import { COLORS } from "@/lib/colors";
import { useEscapeKey } from "@/lib/use-escape";
import Spinner from "@/components/ui/Spinner";
import type { useBulkDelete } from "./useBulkDelete";

type BulkDelete = ReturnType<typeof useBulkDelete>;

function CountTile({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="flex-1 rounded-2xl px-3 py-3 text-center"
      style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.peachyPink}` }}
    >
      <p className="font-bold" style={{ color: COLORS.carminePink, fontSize: 22 }}>
        {value.toLocaleString("en-US")}
      </p>
      <p style={{ color: COLORS.darkSilver, fontSize: 12 }}>{label}</p>
    </div>
  );
}

export function FeedLibraryWipeDialog({
  bulkDelete,
  t,
}: {
  bulkDelete: BulkDelete;
  t: (s: string) => string;
}) {
  const { dialogCounts, typed, setTyped, isDeleting, dialogError, closeDialog, confirmDelete } =
    bulkDelete;
  useEscapeKey(dialogCounts !== null && !isDeleting, closeDialog);
  if (!dialogCounts) return null;

  // Exact match: case-sensitive, no trim (the server compares the same way).
  const canDelete = typed === FEED_LIBRARY_CONFIRM_PHRASE && !isDeleting;

  return (
    <div
      className="fixed top-0 h-full z-50 flex items-center justify-center px-4"
      style={{ left: COLUMN_LEFT, width: COLUMN_WIDTH, backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feed-wipe-title"
        className="w-full bg-white rounded-2xl px-5 pt-5 pb-5 max-h-[85vh] overflow-y-auto overscroll-contain"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}
      >
        <h3
          id="feed-wipe-title"
          className="text-center font-bold"
          style={{ color: COLORS.carminePink, fontSize: 18 }}
        >
          {t("Delete the whole feed library?")}
        </h3>
        <div className="flex gap-3 mt-4">
          <CountTile value={dialogCounts.feeds} label={t("feeds")} />
          <CountTile value={dialogCounts.translations} label={t("translations")} />
        </div>
        <p className="text-sm mt-4" style={{ color: COLORS.darkSilver }}>
          {t("Feed types, categories and custom feeds stay. A backup is taken first.")}
        </p>
        <label
          htmlFor="feed-wipe-confirm"
          className="block text-sm font-bold mt-4"
          style={{ color: COLORS.raisinBlack }}
        >
          {t("Type")}{" "}
          <span style={{ color: COLORS.carminePink }}>{FEED_LIBRARY_CONFIRM_PHRASE}</span>{" "}
          {t("to confirm")}
        </label>
        <input
          id="feed-wipe-confirm"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={isDeleting}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="w-full mt-2 px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ backgroundColor: COLORS.americanDiamond, color: COLORS.raisinBlack }}
        />
        {dialogError && (
          <p role="alert" className="text-sm mt-3" style={{ color: COLORS.carminePink }}>
            {dialogError}
          </p>
        )}
        <div className="flex gap-3 mt-5">
          <button
            onClick={closeDialog}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-2xl font-bold text-sm"
            style={{
              border: `1px solid ${COLORS.gainsboro}`,
              backgroundColor: COLORS.white,
              color: COLORS.raisinBlack,
              cursor: isDeleting ? "not-allowed" : "pointer",
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {t("Cancel")}
          </button>
          <button
            onClick={() => void confirmDelete()}
            disabled={!canDelete}
            className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
            style={{
              border: "none",
              backgroundColor: canDelete || isDeleting ? COLORS.carminePink : COLORS.lightGrayNew,
              color: COLORS.white,
              cursor: canDelete ? "pointer" : "not-allowed",
            }}
          >
            {isDeleting && <Spinner size={16} />}
            {isDeleting ? t("Deleting...") : t("Delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BulkDeleteSection({
  bulkDelete,
  t,
}: {
  bulkDelete: BulkDelete;
  t: (s: string) => string;
}) {
  const { counts, isChecking, didDelete, openDialog } = bulkDelete;
  if (!counts) return null;

  return (
    <>
      <div className="flex items-center gap-2.5 mt-5 ml-3">
        <span
          style={{ width: 6, height: 30, borderRadius: 3, backgroundColor: COLORS.carminePink }}
        />
        <p className="font-bold" style={{ color: COLORS.carminePink, fontSize: 16 }}>
          {t("Delete")}
        </p>
      </div>
      <div
        className="mx-3 mt-3 bg-white rounded-2xl px-5 pt-5 pb-5"
        style={{
          border: `1.5px solid ${COLORS.carminePink}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        }}
      >
        <p className="font-bold" style={{ color: COLORS.raisinBlack, fontSize: 14 }}>
          {t("Feed library")}
        </p>
        <p className="mt-1" style={{ color: COLORS.darkSilver, fontSize: 13 }}>
          {`${counts.feeds.toLocaleString("en-US")} ${t("feeds")}, ${counts.translations.toLocaleString("en-US")} ${t("translations")}`}
        </p>
        <p className="mt-2" style={{ color: COLORS.darkSilver, fontSize: 12 }}>
          {t(
            "Deletes all standard feeds and their translations. Feed types, categories and custom feeds stay."
          )}
        </p>
        <button
          onClick={() => void openDialog()}
          disabled={isChecking}
          className="w-full mt-4 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          style={{
            border: "none",
            backgroundColor: COLORS.carminePink,
            color: COLORS.white,
            cursor: isChecking ? "wait" : "pointer",
            opacity: isChecking ? 0.8 : 1,
          }}
        >
          {isChecking && <Spinner size={16} />}
          {t("Delete feed library")}
        </button>
        {didDelete && (
          <div
            className="mt-4 rounded-2xl px-3 py-3 text-sm"
            style={{ backgroundColor: COLORS.honeydew, color: COLORS.darkAquamarineGreen }}
          >
            <p>{t("To reload the library:")}</p>
            <p className="mt-1">
              <Link href="/admin/feed-sync" className="font-bold underline">
                {t("Open Feed Library Sync")}
              </Link>{" "}
              {t("and tap Sync now, or upload a feed workbook in Upload above.")}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

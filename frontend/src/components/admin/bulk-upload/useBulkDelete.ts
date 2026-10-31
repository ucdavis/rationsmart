"use client";

// Bulk Delete — state and handlers for emptying the standard feed library
// (DELETE /v1/admin/feeds). The page loads a dry run first: 200 shows the
// section with the counts, anything else hides it (403 = the server has the
// feature switched off, which production does by default). Every error from
// the real run means nothing was deleted, so the counts are left alone.

import { useEffect, useRef, useState } from "react";
import { previewFeedLibraryWipe, wipeFeedLibrary } from "@/lib/api";
import { numberField, stringField } from "@/lib/api-client/normalize";
import { errorStatus } from "@/lib/errors";

export interface FeedLibraryCounts {
  feeds: number;
  translations: number;
}

type Snackbar = (message: string, type?: "success" | "error" | "info") => void;

export const WIPE_DISABLED_MESSAGE = "Deleting the feed library isn't enabled on this server.";
export const WIPE_BACKUP_FAILED_MESSAGE =
  "Backup failed, so nothing was deleted. Contact the backend team.";

function countsOf(data: unknown): FeedLibraryCounts {
  return {
    feeds: numberField(data, "feeds") ?? 0,
    translations: numberField(data, "feed_translations") ?? 0,
  };
}

/** Message for a failed preview / wipe, per the backend's status contract. */
export function wipeErrorMessage(err: unknown, t: (s: string) => string): string {
  const status = errorStatus(err);
  if (status === 403) return t(WIPE_DISABLED_MESSAGE);
  if (status === 500) return t(WIPE_BACKUP_FAILED_MESSAGE);
  // 400 / 409 / anything else: the interceptor puts the server's detail here.
  if (err instanceof Error && err.message) return err.message;
  return t("Could not delete the feed library.");
}

function fillText(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(`\${${key}}`).join(value),
    template
  );
}

export function useBulkDelete(showSnackbar: Snackbar, t: (s: string) => string) {
  // null = still loading or hidden; the section renders only with counts.
  const [counts, setCounts] = useState<FeedLibraryCounts | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [dialogCounts, setDialogCounts] = useState<FeedLibraryCounts | null>(null);
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [didDelete, setDidDelete] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    previewFeedLibraryWipe()
      .then((res) => {
        if (!cancelled) setCounts(countsOf(res.data));
      })
      .catch(() => {
        // 403 (feature off) or any other failure: keep the section hidden
        // rather than offer a destructive button with unknown counts.
        if (!cancelled) setCounts(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-run the dry run (the counts may have changed) before opening.
  const openDialog = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const res = await previewFeedLibraryWipe();
      const fresh = countsOf(res.data);
      setCounts(fresh);
      setTyped("");
      setDialogError("");
      setDialogCounts(fresh);
    } catch (err: unknown) {
      if (errorStatus(err) === 403) setCounts(null);
      showSnackbar(wipeErrorMessage(err, t), "error");
    } finally {
      setIsChecking(false);
    }
  };

  const closeDialog = () => {
    if (deletingRef.current) return; // never close mid-request
    setDialogCounts(null);
    setTyped("");
    setDialogError("");
  };

  const confirmDelete = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    setDialogError("");
    try {
      const res = await wipeFeedLibrary(typed);
      const deleted = countsOf(res.data);
      const backup = stringField(res.data, "backup_file");
      let message = fillText(t("Deleted ${feeds} feeds and ${translations} translations."), {
        feeds: String(deleted.feeds),
        translations: String(deleted.translations),
      });
      if (backup) message += ` ${fillText(t("Backup: ${file}"), { file: backup })}`;
      // "Feed library is already empty" — no backup is taken in that case.
      else if (deleted.feeds === 0 && deleted.translations === 0) {
        message = stringField(res.data, "message") ?? message;
      }
      deletingRef.current = false;
      setIsDeleting(false);
      setDialogCounts(null);
      setTyped("");
      setCounts({ feeds: 0, translations: 0 });
      setDidDelete(true);
      showSnackbar(message, "success");
    } catch (err: unknown) {
      // Nothing was deleted; keep the dialog open, never retry.
      deletingRef.current = false;
      setIsDeleting(false);
      setDialogError(wipeErrorMessage(err, t));
    }
  };

  return {
    counts,
    isChecking,
    dialogCounts,
    typed,
    setTyped,
    isDeleting,
    dialogError,
    didDelete,
    openDialog,
    closeDialog,
    confirmDelete,
  };
}

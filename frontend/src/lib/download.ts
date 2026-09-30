// Shared helpers for saving backend file responses (xlsx exports, workbooks).

/**
 * Pulls the filename out of a Content-Disposition header value, e.g.
 * `attachment; filename="feeds.xlsx"` or `filename*=UTF-8''f%C3%A9eds.xlsx`.
 * Returns `fallback` when the header is missing, the name is malformed
 * percent-encoding (decodeURIComponent would throw), or it contains path
 * separators.
 */
export function filenameFromContentDisposition(header: unknown, fallback: string): string {
  const raw = typeof header === "string" ? header : "";
  const match = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)["']?/i.exec(raw);
  if (!match?.[1]) return fallback;
  let name: string;
  try {
    name = decodeURIComponent(match[1].trim());
  } catch {
    name = match[1].trim();
  }
  return name && !/[\\/]/.test(name) ? name : fallback;
}

/** Reads Content-Disposition from an axios headers object (either casing). */
export function contentDispositionOf(headers: Record<string, unknown>): unknown {
  return headers["content-disposition"] ?? headers["Content-Disposition"];
}

// Upload guard — `accept=` on a file input is only a hint to the picker, so
// check the extension and size before sending anything. 4 MB stays under the
// 4.5 MB Vercel function body limit the proxy runs behind.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// MIME types each accepted extension may report. Pickers on some platforms
// (Android, older Windows) report "" or application/octet-stream for
// spreadsheets, so those are tolerated; anything else is refused (audit A-22).
const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  ".csv": ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".xls": ["application/vnd.ms-excel"],
};
const GENERIC_MIME = new Set(["", "application/octet-stream"]);

/** Returns an error message for an unacceptable file, or null when it's fine. */
export function uploadFileProblem(file: File, allowedExtensions: readonly string[]): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return `Please choose a ${allowedExtensions.join(" / ")} file`;
  }
  const type = (file.type || "").toLowerCase();
  const allowedTypes = MIME_BY_EXTENSION[ext];
  if (allowedTypes && !GENERIC_MIME.has(type) && !allowedTypes.includes(type)) {
    return "That file's type doesn't match its extension";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "File is too large (max 4 MB)";
  if (file.size === 0) return "File is empty";
  return null;
}

/**
 * Saves a Blob as a file via a temporary same-origin object URL (the one
 * copy of this for every export / workbook / CSV download — audit B-21).
 * The URL is revoked shortly after, once the browser has started the save.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

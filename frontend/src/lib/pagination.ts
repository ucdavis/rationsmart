// Walks a paginated admin endpoint until it's exhausted, so admin lists are
// no longer silently truncated at the first page (audit B-10).

/** Largest page the v1 admin list endpoints accept (`page_size` maximum). */
export const ADMIN_PAGE_SIZE = 100;

/** Hard stop so a backend that mis-reports totals can't loop forever. */
const MAX_PAGES = 50;

interface PageMeta {
  total_pages?: number;
  total_count?: number;
}

/**
 * Calls `fetchPage(1)`, `fetchPage(2)`, … and concatenates `pick(res.data)`.
 * Stops on a short page, when `total_pages` / `total_count` say it's done, or
 * after MAX_PAGES. The first page's errors propagate; later pages too, so a
 * partial list is never shown as if it were complete.
 */
export async function collectPages<T>(
  fetchPage: (page: number) => Promise<{ data: unknown }>,
  pick: (data: unknown) => T[],
  pageSize = ADMIN_PAGE_SIZE
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchPage(page);
    const items = pick(res.data);
    all.push(...items);
    const meta = (res.data ?? {}) as PageMeta;
    if (items.length < pageSize) break;
    if (meta.total_pages != null && page >= meta.total_pages) break;
    if (meta.total_count != null && all.length >= meta.total_count) break;
  }
  return all;
}

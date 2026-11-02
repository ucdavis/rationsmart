// Admin Users — shared row type (split out of admin/users/page.tsx, audit B-17).

export interface AdminUser {
  id: string;
  name: string;
  email_id: string;
  country?: string | { name: string };
  is_active: boolean;
  created_at?: string;
  is_admin?: boolean;
  /** Why an inactive account is off (W12): "self" = the user deleted it and
   *  can come back by registering again; "admin" = an admin disabled it. */
  deactivated_by?: "self" | "admin" | null;
  deactivated_at?: string | null;
}

/** Status badge text for a list card; falls back to INACTIVE when the
 *  backend gives no reason. */
export function statusBadgeLabel(u: AdminUser, t: (source: string) => string): string {
  if (u.is_active) return t("ACTIVE");
  if (u.deactivated_by === "self") return t("DELETED BY USER");
  if (u.deactivated_by === "admin") return t("DISABLED BY ADMIN");
  return t("INACTIVE");
}

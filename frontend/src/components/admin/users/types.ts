// Admin Users — shared row type (split out of admin/users/page.tsx, audit B-17).

export interface AdminUser {
  id: string;
  name: string;
  email_id: string;
  country?: string | { name: string };
  is_active: boolean;
  created_at?: string;
  is_admin?: boolean;
}

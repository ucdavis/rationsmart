"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getAdminUsers, toggleUserStatus, toggleUserAdmin, getCountries, type Country } from "@/lib/api";
import { formatTotalUsers } from "@/lib/validators";
import { useT } from "@/lib/i18n-ui";
import Toolbar from "@/components/Toolbar";
import CustomSelect from "@/components/CustomSelect";

interface AdminUser {
  id: string;
  name: string;
  email_id: string;
  country?: string | { name: string };
  is_active: boolean;
  created_at?: string;
  is_admin?: boolean;
}

function SkeletonCard() {
  return (
    <div
      className="mx-3 my-2 rounded-2xl bg-white p-4 space-y-3"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      <div className="flex justify-between">
        <div className="h-4 w-32 rounded-full shimmer" />
        <div className="h-6 w-14 rounded-full shimmer" />
      </div>
      <div className="h-3 w-48 rounded-full shimmer" />
      <div className="h-3 w-24 rounded-full shimmer" />
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, showSnackbar } = useStore((s) => ({ user: s.user, showSnackbar: s.showSnackbar }));
  const t = useT();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [adminTogglingId, setAdminTogglingId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  // Default the country filter to the signed-in admin's own country so the
  // page opens already scoped to their country's users. They can still switch
  // to "All Countries" or any other country from the dropdown.
  const [countryFilter, setCountryFilter] = useState<string>(
    () => useStore.getState().user?.country ?? ""
  );
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  // Admin-toggle confirmation — holds the user awaiting a grant/revoke confirm.
  const [confirmAdmin, setConfirmAdmin] = useState<AdminUser | null>(null);

  const load = async (country = countryFilter, s = statusFilter, q = search) => {
    if (!user?.id) return;
    setIsLoading(true);
    // Backend response shape: { users, total_count, page, page_size, total_pages }.
    // Backend caps page_size at 100, so for admins with > 100 users we fetch
    // every page in sequence and concatenate. Server-side filters (country /
    // status / search) are applied by the endpoint, so with a filter set only
    // the matching users come back and the loop stays short.
    const PAGE_SIZE = 100;
    try {
      const all: AdminUser[] = [];
      let page = 1;
      let totalCount = 0;
      let totalPages = 1;
      do {
        const res = await getAdminUsers(user.id, page, PAGE_SIZE, country, s, q);
        const data = res.data;
        const list: AdminUser[] = Array.isArray(data) ? data : (data?.users ?? data?.items ?? []);
        all.push(...list);
        totalCount = data?.total_count ?? data?.total ?? all.length;
        totalPages = data?.total_pages ?? Math.ceil(totalCount / PAGE_SIZE);
        if (list.length < PAGE_SIZE) break;
        page += 1;
      } while (page <= totalPages);
      setUsers(all);
      setTotal(totalCount);
    } catch {
      showSnackbar(t("Could not load users"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Country list for the filter dropdown.
  useEffect(() => {
    getCountries()
      .then((res) => setCountries(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  // Re-query the server whenever a filter changes. Debounced so typing in the
  // search box (and rapid pill/dropdown changes) doesn't fire a request per
  // keystroke.
  useEffect(() => {
    if (!user?.id) return;
    const timer = setTimeout(() => {
      load(countryFilter, statusFilter, search);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, countryFilter, statusFilter, search]);

  const handleToggle = async (u: AdminUser) => {
    if (!user?.id) return;
    setTogglingId(u.id);
    try {
      await toggleUserStatus(u.id, user.id, !u.is_active);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: !u.is_active } : x)));
      showSnackbar(`User ${!u.is_active ? "activated" : "deactivated"}`, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Toggle failed");
      showSnackbar(msg, "error");
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleAdmin = async (u: AdminUser) => {
    if (!user?.id) return;
    // Guard against an admin changing their own role (would risk self-lockout);
    // the backend also rejects this, but we block it client-side too.
    if (u.id === user.id) {
      showSnackbar(t("You can't change your own admin role"), "error");
      return;
    }
    const next = !u.is_admin;
    setAdminTogglingId(u.id);
    try {
      await toggleUserAdmin(u.id, user.id, next);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_admin: next } : x)));
      setSelectedUser((prev) => (prev && prev.id === u.id ? { ...prev, is_admin: next } : prev));
      showSnackbar(next ? t("User granted admin access") : t("Admin access revoked"), "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Could not update admin role");
      showSnackbar(msg, "error");
    } finally {
      setAdminTogglingId(null);
    }
  };

  const getCountryName = (country: AdminUser["country"]) => {
    if (!country) return "";
    if (typeof country === "string") return country;
    return country.name ?? "";
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)" }}
    >
      <Toolbar type="back" title={t("User Management")} onBack={() => router.back()} />

      {/* Stats card — TOTAL USERS uppercase, matches Android cv_aggregated_view */}
      <div
        className="mx-3 mt-5 bg-white flex items-center justify-between px-3 py-5"
        style={{ borderRadius: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
      >
        <div>
          <p
            className="uppercase tracking-wide"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 12 }}
          >
            {t("Total Users")}
          </p>
          <p
            style={{
              color: "#064E3B",
              fontFamily: "Nunito, sans-serif",
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {formatTotalUsers(total)}
          </p>
        </div>
        <div
          className="flex items-center justify-center"
          style={{ width: 50, height: 50, backgroundColor: "#E8F5E9", borderRadius: 16 }}
        >
          {/* ic_users.xml — exact Android path, tinted dark_aquamarine_green.
              Original size in Android is 30dp inside a 10dp-padded MaterialCardView. */}
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#064E3B">
            <path d="M16,11c1.66,0 2.99,-1.34 2.99,-3S17.66,5 16,5s-3,1.34 -3,3 1.34,3 3,3zM8,11c1.66,0 2.99,-1.34 2.99,-3S9.66,5 8,5 5,6.34 5,8s1.34,3 3,3zM8,13c-2.33,0 -7,1.17 -7,3.5L1,18c0,0.55 0.45,1 1,1h12c0.55,0 1,-0.45 1,-1v-1.5c0,-2.33 -4.67,-3.5 -7,-3.5zM16,13c-0.29,0 -0.62,0.02 -0.97,0.05 0.02,0.01 0.03,0.03 0.04,0.04 1.14,0.83 1.93,1.94 1.93,3.41L17,18c0,0.35 -0.07,0.69 -0.18,1L22,19c0.55,0 1,-0.45 1,-1v-1.5c0,-2.33 -4.67,-3.5 -7,-3.5z" />
          </svg>
        </div>
      </div>

      {/* "Users" section heading (matches Android tv_title_users) */}
      <p
        className="font-bold ml-3 mt-4"
        style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
      >
        {t("Users")}
      </p>

      {/* Filter bar — country dropdown + search + status pills. All three map
          to server-side query params on GET /v1/admin/users (country / search
          / status), so selecting a country returns only that country's users. */}
      <div className="mx-3 mt-2 space-y-2">
        {/* Country dropdown — same chrome as the app's standard dropdowns
            (cattle-info SelectInput): a rounded-2xl padded pill wrapping a
            transparent-trigger CustomSelect, so the pill supplies the box and
            CustomSelect just renders the label + chevron + zebra popup. */}
        <div
          className="bg-white rounded-2xl px-4 py-3"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
        >
          <CustomSelect
            transparentTrigger
            value={countryFilter}
            onChange={setCountryFilter}
            options={[
              { value: "", label: t("All Countries") },
              ...countries.map((c) => ({ value: c.name, label: c.name })),
            ]}
            placeholder={t("All Countries")}
          />
        </div>

        {/* Search box */}
        <div
          className="flex items-center bg-white rounded-2xl"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)", padding: "0 16px" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#6D6D6D" style={{ flexShrink: 0 }}>
            <path d="M15.5,14h-0.79l-0.28,-0.27C15.41,12.59 16,11.11 16,9.5 16,5.91 13.09,3 9.5,3S3,5.91 3,9.5 5.91,16 9.5,16c1.61,0 3.09,-0.59 4.23,-1.57l0.27,0.28v0.79l5,4.99L20.49,19l-4.99,-5zM9.5,14C7.01,14 5,11.99 5,9.5S7.01,5 9.5,5 14,7.01 14,9.5 11.99,14 9.5,14z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search by name or email")}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              padding: "11px 8px",
              fontFamily: "Nunito, sans-serif",
              fontSize: 14,
              color: "#231F20",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label={t("Clear search")}
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, lineHeight: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#6D6D6D">
                <path d="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z" />
              </svg>
            </button>
          )}
        </div>

        {/* Status pills */}
        <div className="flex gap-2">
          {(
            [
              { v: "", l: t("All") },
              { v: "active", l: t("Active") },
              { v: "inactive", l: t("Inactive") },
            ] as const
          ).map((p) => {
            const active = statusFilter === p.v;
            return (
              <button
                key={p.v}
                onClick={() => setStatusFilter(p.v as "" | "active" | "inactive")}
                className="font-bold"
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 12,
                  border: `1px solid ${active ? "#064E3B" : "rgba(5,188,109,0.20)"}`,
                  backgroundColor: active ? "#064E3B" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#064E3B",
                  fontFamily: "Nunito, sans-serif",
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
              >
                {p.l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2 pb-6">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <p
              className="text-base font-bold mb-2"
              style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
            >
              {t("No users found")}
            </p>
          </div>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="mx-3 my-2 bg-white"
              style={{
                borderRadius: 20,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                cursor: "pointer",
                paddingBottom: 14,
              }}
              onClick={() => setSelectedUser(u)}
            >
              {/* Top row: rounded-square avatar + ROLE label | status badge top-right */}
              <div
                className="flex items-start justify-between gap-3"
                style={{ padding: "12px 12px 0" }}
              >
                <div className="flex items-center flex-1 min-w-0" style={{ gap: 12 }}>
                  {/* Rounded-square avatar pill — matches Android cv_role
                      (mint_whisper bg, 16dp corner, 10dp content padding,
                      24dp icon → 44dp pill). */}
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "#E8F5E9", borderRadius: 16, padding: 10 }}
                  >
                    {u.is_admin ? (
                      /* ic_admin — shield with face inside */
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#064E3B">
                        <path d="M17,11c0.34,0 0.67,0.04 1,0.09V7.58c0,-0.8 -0.47,-1.52 -1.2,-1.83l-5.5,-2.4c-0.51,-0.22 -1.09,-0.22 -1.6,0l-5.5,2.4C3.47,6.07 3,6.79 3,7.58v3.6c0,4.54 3.2,8.79 7.5,9.82c0.55,-0.13 1.08,-0.32 1.6,-0.55C11.41,19.47 11,18.28 11,17C11,13.69 13.69,11 17,11z" />
                        <path d="M17,13c-2.21,0 -4,1.79 -4,4c0,2.21 1.79,4 4,4s4,-1.79 4,-4C21,14.79 19.21,13 17,13zM17,14.38c0.62,0 1.12,0.51 1.12,1.12s-0.51,1.12 -1.12,1.12s-1.12,-0.51 -1.12,-1.12S16.38,14.38 17,14.38zM17,19.75c-0.93,0 -1.74,-0.46 -2.24,-1.17c0.05,-0.72 1.51,-1.08 2.24,-1.08s2.19,0.36 2.24,1.08C18.74,19.29 17.93,19.75 17,19.75z" />
                      </svg>
                    ) : (
                      /* ic_user — solid filled person silhouette */
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#064E3B">
                        <path d="M12,12c2.21,0 4,-1.79 4,-4s-1.79,-4 -4,-4 -4,1.79 -4,4 1.79,4 4,4zM12,14c-2.67,0 -8,1.34 -8,4v1c0,0.55 0.45,1 1,1h14c0.55,0 1,-0.45 1,-1v-1c0,-2.66 -5.33,-4 -8,-4z" />
                      </svg>
                    )}
                  </div>
                  <span
                    className="font-bold uppercase"
                    style={{ color: "#064E3B", fontSize: 12, fontFamily: "Nunito, sans-serif" }}
                  >
                    {u.is_admin ? t("ADMIN") : t("USER")}
                  </span>
                </div>
                {/* Status badge — Android bg_active_gradient / bg_inactive_gradient:
                    rounded rect (10dp), solid honeydew/peachy_pink bg, 1dp colored
                    stroke. Text colors: dark_aquamarine_green / carmine_pink. */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(u);
                  }}
                  disabled={togglingId === u.id}
                  className="font-bold"
                  style={{
                    backgroundColor: u.is_active ? "#F0FDF4" : "#FEC5BB",
                    color: u.is_active ? "#064E3B" : "#E44A4A",
                    border: `1px solid ${u.is_active ? "rgba(5,188,109,0.15)" : "rgba(228,74,74,0.20)"}`,
                    borderRadius: 10,
                    padding: "2px 10px",
                    fontSize: 10,
                    cursor: togglingId === u.id ? "not-allowed" : "pointer",
                    opacity: togglingId === u.id ? 0.7 : 1,
                    fontFamily: "Nunito, sans-serif",
                  }}
                >
                  {togglingId === u.id ? "..." : u.is_active ? t("ACTIVE") : t("INACTIVE")}
                </button>
              </div>
              {/* Name — starts after the 44px avatar pill (12 card pad + 44 avatar + 12 gap = 68) */}
              <p
                className="font-bold truncate"
                style={{
                  color: "#231F20",
                  fontSize: 18,
                  fontFamily: "Nunito, sans-serif",
                  margin: "4px 12px 0 68px",
                }}
              >
                {u.name}
              </p>
              {/* Email row — envelope icon prefix. Android ic_email is a
                  FILLED envelope (not outlined), tinted dark_silver. 16dp size. */}
              <div className="flex items-center" style={{ margin: "8px 12px 0 68px", gap: 4 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="#6D6D6D"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M20,4L4,4c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2L22,6c0,-1.1 -0.9,-2 -2,-2zM19.6,8.25l-6.54,4.09c-0.65,0.41 -1.47,0.41 -2.12,0L4.4,8.25c-0.25,-0.16 -0.4,-0.43 -0.4,-0.72 0,-0.67 0.73,-1.07 1.3,-0.72L12,11l6.7,-4.19c0.57,-0.35 1.3,0.05 1.3,0.72 0,0.29 -0.15,0.56 -0.4,0.72z" />
                </svg>
                <span
                  className="truncate"
                  style={{ color: "#6D6D6D", fontSize: 14, fontFamily: "Nunito, sans-serif" }}
                >
                  {u.email_id}
                </span>
              </div>
              {/* Country row — location pin (filled) icon prefix. Android
                  ic_location renders as a filled outline pin with center dot. */}
              {getCountryName(u.country) && (
                <div className="flex items-center" style={{ margin: "4px 12px 0 68px", gap: 4 }}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 960 960"
                    fill="#6D6D6D"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M480,769q119,-107 179.5,-197T720,411q0,-105 -68.5,-174T480,168q-103,0 -171.5,69T240,411q0,71 60.5,161T480,769ZM480,841q-13,0 -24.5,-4.5T433,823q-40,-35 -86.5,-82T260,640q-40,-54 -66,-112.5T168,411q0,-134 89,-224.5T480,96q133,0 222.5,90.5T792,411q0,58 -26.5,117t-66,113q-39.5,54 -86,100.5T527,823q-11,9 -22.5,13.5T480,841ZM480,480q30,0 51,-21t21,-51q0,-30 -21,-51t-51,-21q-30,0 -51,21t-21,51q0,30 21,51t51,21Z" />
                  </svg>
                  <span
                    style={{ color: "#6D6D6D", fontSize: 14, fontFamily: "Nunito, sans-serif" }}
                  >
                    {getCountryName(u.country)}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* User Detail bottom sheet — matches Android dialog_user_details.xml.
          Confined to the 480px centered column on desktop. */}
      {selectedUser && (
        <div
          className="fixed top-0 h-full z-50 flex items-end justify-center"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="w-full rounded-t-3xl bg-white"
            style={{
              maxWidth: "min(100vw, 480px)",
              maxHeight: "92vh",
              overflowY: "auto",
              paddingBottom: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (Android view_drag_handle: 40dp × 6dp mint pin) */}
            <div className="flex justify-center" style={{ paddingTop: 16, marginBottom: 14 }}>
              <div style={{ width: 40, height: 6, borderRadius: 3, backgroundColor: "#C8E6C9" }} />
            </div>

            {/* Role icon — circular pill (size_60 = circular) with mint_whisper
                bg + go_green_15 stroke. Uses ic_admin_42 / ic_user_42 (40dp). */}
            <div className="flex justify-center mb-5">
              <div
                className="flex items-center justify-center"
                style={{
                  backgroundColor: "#E8F5E9",
                  border: "1px solid rgba(5,188,109,0.15)",
                  borderRadius: 60,
                  padding: 10,
                }}
              >
                {selectedUser.is_admin ? (
                  /* ic_admin_42 — 40dp shield-with-face (viewport 20×20) */
                  <svg width="40" height="40" viewBox="0 0 20 20" fill="#064E3B">
                    <path d="M10.14,10.45c1.57,-1.58 2.77,-1.59 3.86,-1.31v-2.3c0,-0.4 -0.24,-0.76 -0.6,-0.92l-4,-1.75c-0.26,-0.11 -0.54,-0.11 -0.8,0l-4,1.75C4.24,6.08 4,6.44 4,6.84v2.62c0,3.03 2.13,5.86 5,6.55c0.35,-0.08 0.7,-0.2 1.02,-0.35C9.42,14.98 9.04,14.1 9,13.14C8.97,12.12 9.43,11.17 10.14,10.45z" />
                    <path d="M13,10c-1.66,0 -3,1.34 -3,3c0,1.66 1.34,3 3,3s3,-1.34 3,-3C16,11.34 14.66,10 13,10zM13,11.03c0.47,0 0.84,0.38 0.84,0.84c0,0.46 -0.38,0.84 -0.84,0.84s-0.84,-0.38 -0.84,-0.84C12.16,11.41 12.53,11.03 13,11.03zM13,15.06c-0.7,0 -1.31,-0.35 -1.68,-0.87c0.04,-0.54 1.13,-0.81 1.68,-0.81s1.64,0.27 1.68,0.81C14.31,14.72 13.7,15.06 13,15.06z" />
                  </svg>
                ) : (
                  /* ic_user_42 — 40dp Material person silhouette (viewport 960×960) */
                  <svg width="40" height="40" viewBox="0 0 960 960" fill="#064E3B">
                    <path d="M480,479.33q-66,0 -109.67,-43.66Q326.67,392 326.67,326t43.66,-109.67Q414,172.67 480,172.67t109.67,43.66Q633.33,260 633.33,326t-43.66,109.67Q546,479.33 480,479.33ZM160,733.33L160,700q0,-36.67 18.5,-64.17T226.67,594q65.33,-30.33 127.66,-45.5 62.34,-15.17 125.67,-15.17t125.33,15.5q62,15.5 127.28,45.3 30.54,14.42 48.96,41.81Q800,663.33 800,700v33.33q0,27.5 -19.58,47.09Q760.83,800 733.33,800L226.67,800q-27.5,0 -47.09,-19.58Q160,760.83 160,733.33ZM226.67,733.33h506.66L733.33,700q0,-14.33 -8.16,-27 -8.17,-12.67 -20.5,-19 -60.67,-29.67 -114.34,-41.83Q536.67,600 480,600t-111,12.17Q314.67,624.33 254.67,654q-12.34,6.33 -20.17,19 -7.83,12.67 -7.83,27v33.33ZM480,412.67q37,0 61.83,-24.84Q566.67,363 566.67,326t-24.84,-61.83Q517,239.33 480,239.33t-61.83,24.84Q393.33,289 393.33,326t24.84,61.83Q443,412.67 480,412.67Z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Name — centered, bold, raisin_black, font_20 */}
            <p
              className="text-center font-bold"
              style={{
                color: "#231F20",
                fontFamily: "Nunito, sans-serif",
                fontSize: 20,
                marginInline: 12,
              }}
            >
              {selectedUser.name}
            </p>

            {/* Status badge — centered below name (matches tv_status in
                dialog_user_details.xml: same bg_active_gradient /
                bg_inactive_gradient as the list cards). Text reads
                "ACTIVE ACCOUNT" / "INACTIVE ACCOUNT". */}
            <div className="flex justify-center" style={{ marginTop: 4 }}>
              <span
                className="font-bold"
                style={{
                  backgroundColor: selectedUser.is_active ? "#F0FDF4" : "#FEC5BB",
                  color: selectedUser.is_active ? "#064E3B" : "#E44A4A",
                  border: `1px solid ${selectedUser.is_active ? "rgba(5,188,109,0.15)" : "rgba(228,74,74,0.20)"}`,
                  borderRadius: 10,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontFamily: "Nunito, sans-serif",
                }}
              >
                {selectedUser.is_active ? t("ACTIVE ACCOUNT") : t("INACTIVE ACCOUNT")}
              </span>
            </div>

            {/* Email + Country card (Android cv_user_details: white card,
                30dp corner, with american_diamond icon boxes + dark_silver
                title labels + raisin_black bold values, separator between). */}
            <div
              className="bg-white"
              style={{
                margin: "20px 12px 0",
                borderRadius: 30,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                padding: 20,
              }}
            >
              {/* Email row */}
              <div className="flex items-center" style={{ gap: 12 }}>
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#F1F5F9", borderRadius: 10, padding: 10 }}
                >
                  {/* ic_alternate_email — filled envelope, dark_silver tint */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#6D6D6D">
                    <path d="M20,4L4,4c-1.1,0 -1.99,0.9 -1.99,2L2,18c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2L22,6c0,-1.1 -0.9,-2 -2,-2zM19.6,8.25l-7.07,4.42c-0.32,0.2 -0.74,0.2 -1.06,0L4.4,8.25c-0.25,-0.16 -0.4,-0.43 -0.4,-0.72 0,-0.67 0.73,-1.07 1.3,-0.72L12,11l6.7,-4.19c0.57,-0.35 1.3,0.05 1.3,0.72 0,0.29 -0.15,0.56 -0.4,0.72z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>
                    {t("Email Address")}
                  </p>
                  <p
                    className="font-bold truncate"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
                  >
                    {selectedUser.email_id}
                  </p>
                </div>
              </div>

              {/* Separator (Android view_separator: 1dp sparkling_silver,
                  starts from end of icon box) */}
              <div style={{ height: 1, backgroundColor: "#E2E8F0", margin: "20px 0 0 56px" }} />

              {/* Country row */}
              <div className="flex items-center" style={{ gap: 12, marginTop: 20 }}>
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#F1F5F9", borderRadius: 10, padding: 10 }}
                >
                  {/* ic_globe — dark_silver tint */}
                  <svg width="24" height="24" viewBox="0 0 960 960" fill="#6D6D6D">
                    <path d="M480,880q-83,0 -156,-31.5T197,763q-54,-54 -85.5,-127T80,480q0,-83 31.5,-156T197,197q54,-54 127,-85.5T480,80q83,0 156,31.5T763,197q54,54 85.5,127T880,480q0,83 -31.5,156T763,763q-54,54 -127,85.5T480,880ZM440,798v-78q-33,0 -56.5,-23.5T360,640v-40L168,408q-3,18 -5.5,36t-2.5,36q0,121 79.5,212T440,798ZM716,696q41,-45 62.5,-100.5T800,480q0,-98 -54.5,-179T600,184v16q0,33 -23.5,56.5T520,280h-80v80q0,17 -11.5,28.5T400,400h-80v80h240q17,0 28.5,11.5T600,520v120h40q26,0 47,15.5t29,40.5Z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", fontSize: 12 }}>
                    {t("Country")}
                  </p>
                  <p
                    className="font-bold"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
                  >
                    {getCountryName(selectedUser.country) || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Account Activation card with toggle switch
                (Android cv_toggle_status: white card, 20dp corner,
                go_green_15 stroke 1dp). */}
            <div
              className="bg-white flex items-center justify-between"
              style={{
                margin: "20px 12px 0",
                borderRadius: 20,
                border: "1px solid rgba(5,188,109,0.15)",
                padding: 12,
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="font-bold"
                  style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
                >
                  {t("Account Activation")}
                </p>
                <p
                  style={{
                    color: "#231F20",
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 14,
                    marginTop: 2,
                  }}
                >
                  {t("Set user status")}
                </p>
              </div>
              {/* Material-style switch */}
              <button
                onClick={() => {
                  handleToggle(selectedUser);
                  setSelectedUser(null);
                }}
                disabled={togglingId === selectedUser.id}
                aria-label={selectedUser.is_active ? t("Deactivate user") : t("Activate user")}
                style={{
                  width: 52,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: selectedUser.is_active ? "#064E3B" : "#CBD5E1",
                  border: "none",
                  position: "relative",
                  cursor: togglingId === selectedUser.id ? "not-allowed" : "pointer",
                  transition: "background-color 0.18s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: selectedUser.is_active ? 24 : 4,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: "#FFFFFF",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.18s",
                  }}
                />
              </button>
            </div>

            {/* Administrator Access card — grant/revoke the admin role.
                Hidden entirely for inactive accounts (an inactive user has no
                sign-in access, so promoting them to admin is meaningless).
                Also gated on the current user being an admin — only an admin
                can grant/revoke another user's admin role. */}
            {selectedUser.is_active && user?.is_admin && (
              <div
                className="bg-white flex items-center justify-between"
                style={{
                  margin: "16px 12px 0",
                  borderRadius: 20,
                  border: "1px solid rgba(5,188,109,0.15)",
                  padding: 12,
                }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="font-bold"
                    style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 16 }}
                  >
                    {t("Administrator Access")}
                  </p>
                  <p
                    style={{
                      color: "#231F20",
                      fontFamily: "Nunito, sans-serif",
                      fontSize: 14,
                      marginTop: 2,
                    }}
                  >
                    {selectedUser.id === user?.id
                      ? t("You can't change your own role")
                      : t("Grant or revoke admin rights")}
                  </p>
                </div>
                <button
                  onClick={() => setConfirmAdmin(selectedUser)}
                  disabled={
                    adminTogglingId === selectedUser.id || selectedUser.id === user?.id
                  }
                  aria-label={
                    selectedUser.is_admin ? t("Revoke admin access") : t("Grant admin access")
                  }
                  style={{
                    width: 52,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: selectedUser.is_admin ? "#064E3B" : "#CBD5E1",
                    border: "none",
                    position: "relative",
                    cursor:
                      adminTogglingId === selectedUser.id || selectedUser.id === user?.id
                        ? "not-allowed"
                        : "pointer",
                    transition: "background-color 0.18s",
                    flexShrink: 0,
                    opacity: selectedUser.id === user?.id ? 0.5 : 1,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      left: selectedUser.is_admin ? 24 : 4,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      backgroundColor: "#FFFFFF",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      transition: "left 0.18s",
                    }}
                  />
                </button>
              </div>
            )}

            {/* Save + Cancel buttons (Android btn_save filled green,
                btn_cancel outlined). Save toggles status via existing handler. */}
            <button
              onClick={() => {
                handleToggle(selectedUser);
                setSelectedUser(null);
              }}
              disabled={togglingId === selectedUser.id}
              className="font-bold"
              style={{
                display: "block",
                width: "calc(100% - 24px)",
                margin: "20px 12px 0",
                padding: "12px 0",
                backgroundColor: "#064E3B",
                color: "white",
                border: "none",
                borderRadius: 12,
                cursor: togglingId === selectedUser.id ? "not-allowed" : "pointer",
                opacity: togglingId === selectedUser.id ? 0.7 : 1,
                fontFamily: "Nunito, sans-serif",
                fontSize: 16,
              }}
            >
              {t("Save")}
            </button>
            <button
              onClick={() => setSelectedUser(null)}
              className="font-bold"
              style={{
                display: "block",
                width: "calc(100% - 24px)",
                margin: "20px 12px 0",
                padding: "12px 0",
                backgroundColor: "white",
                color: "#064E3B",
                border: "2px solid #064E3B",
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: "Nunito, sans-serif",
                fontSize: 16,
              }}
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Admin grant/revoke confirmation — a second, explicit yes/no in the UI
          before the user's role actually changes (sits above the detail
          sheet). */}
      {confirmAdmin && (
        <div
          className="fixed top-0 h-full flex items-center justify-center px-6"
          style={{
            left: "max(0px, calc((100vw - 480px) / 2))",
            width: "min(100vw, 480px)",
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 60,
          }}
          onClick={() => setConfirmAdmin(null)}
        >
          <div
            className="bg-white rounded-2xl w-full"
            style={{ padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="font-bold"
              style={{ color: "#231F20", fontFamily: "Nunito, sans-serif", fontSize: 18 }}
            >
              {confirmAdmin.is_admin ? t("Revoke admin access?") : t("Make this user an admin?")}
            </p>
            <p
              style={{
                color: "#6D6D6D",
                fontFamily: "Nunito, sans-serif",
                fontSize: 14,
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              <span className="font-bold" style={{ color: "#231F20" }}>
                {confirmAdmin.name}
              </span>{" "}
              {confirmAdmin.is_admin
                ? t("will lose administrator access and become a regular user.")
                : t("will be granted full administrator access to manage users, feeds and settings.")}
            </p>
            <div className="flex gap-3" style={{ marginTop: 20 }}>
              <button
                onClick={() => setConfirmAdmin(null)}
                className="font-bold"
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 12,
                  border: "2px solid #064E3B",
                  backgroundColor: "white",
                  color: "#064E3B",
                  cursor: "pointer",
                  fontFamily: "Nunito, sans-serif",
                  fontSize: 15,
                }}
              >
                {t("Cancel")}
              </button>
              <button
                onClick={() => {
                  const target = confirmAdmin;
                  setConfirmAdmin(null);
                  handleToggleAdmin(target);
                }}
                className="font-bold"
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 12,
                  border: "none",
                  backgroundColor: confirmAdmin.is_admin ? "#E44A4A" : "#064E3B",
                  color: "white",
                  cursor: "pointer",
                  fontFamily: "Nunito, sans-serif",
                  fontSize: 15,
                }}
              >
                {confirmAdmin.is_admin ? t("Revoke") : t("Make Admin")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

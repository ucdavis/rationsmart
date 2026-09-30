"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  getAdminUsers,
  toggleUserStatus,
  toggleUserAdmin,
  getCountries,
  type Country,
} from "@/lib/api";
import { formatTotalUsers } from "@/lib/validators";
import { useT } from "@/lib/i18n-ui";
import Toolbar from "@/components/Toolbar";
import type { AdminUser } from "@/components/admin/users/types";
import UserDetailSheet from "@/components/admin/users/UserDetailSheet";
import DeactivateUserDialog from "@/components/admin/users/DeactivateUserDialog";
import AdminRoleDialog from "@/components/admin/users/AdminRoleDialog";
import CustomSelect from "@/components/CustomSelect";
import { useEscapeKey } from "@/lib/use-escape";
import { ADMIN_PAGE_SIZE } from "@/lib/pagination";
import { COLORS, ADMIN_BACKGROUND } from "@/lib/colors";
import { useLatestRef } from "@/lib/use-latest";

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
  // Deactivation confirmation — one tap on a status badge must not lock a
  // user out without a second, explicit yes.
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUser | null>(null);
  // Unsaved status chosen with the switch in the user sheet. null = unchanged.
  // Only "Save" commits it; Cancel / backdrop discards it.
  const [sheetActive, setSheetActive] = useState<boolean | null>(null);
  useEffect(() => setSheetActive(null), [selectedUser?.id]);
  useEscapeKey(!!confirmAdmin, () => setConfirmAdmin(null));
  useEscapeKey(!!confirmDeactivate, () => setConfirmDeactivate(null));
  useEscapeKey(!!(selectedUser && !confirmAdmin && !confirmDeactivate), () =>
    setSelectedUser(null)
  );

  const load = async (country = countryFilter, s = statusFilter, q = search) => {
    if (!user?.id) return;
    setIsLoading(true);
    // Backend response shape: { users, total_count, page, page_size, total_pages }.
    // Backend caps page_size at 100, so for admins with > 100 users we fetch
    // every page in sequence and concatenate. Server-side filters (country /
    // status / search) are applied by the endpoint, so with a filter set only
    // the matching users come back and the loop stays short.
    try {
      const all: AdminUser[] = [];
      let page = 1;
      let totalCount = 0;
      let totalPages = 1;
      do {
        const res = await getAdminUsers(user.id, page, ADMIN_PAGE_SIZE, country, s, q);
        const data = res.data;
        const list: AdminUser[] = Array.isArray(data) ? data : (data?.users ?? data?.items ?? []);
        all.push(...list);
        totalCount = data?.total_count ?? data?.total ?? all.length;
        totalPages = data?.total_pages ?? Math.ceil(totalCount / ADMIN_PAGE_SIZE);
        if (list.length < ADMIN_PAGE_SIZE) break;
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

  // Country list for the filter dropdown. Mount-only fetch: `t` is read
  // through a ref because useT() returns a new function every render.
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    getCountries()
      .then((res) => setCountries(Array.isArray(res.data) ? res.data : []))
      // The list still loads; only the Country filter dropdown is affected.
      .catch(() =>
        useStore.getState().showSnackbar(tRef.current("Could not load countries"), "error")
      );
  }, []);

  // Re-query the server whenever a filter changes. Debounced so typing in the
  // search box (and rapid pill/dropdown changes) doesn't fire a request per
  // keystroke.
  // Read, not re-run on: see useLatestRef (audit B-20).
  const effectInputs1 = useLatestRef({ load });
  useEffect(() => {
    const { load } = effectInputs1.current;
    if (!user?.id) return;
    const timer = setTimeout(() => {
      void load(countryFilter, statusFilter, search);
    }, 350);
    return () => clearTimeout(timer);
  }, [user?.id, countryFilter, statusFilter, search, effectInputs1]);

  const handleToggle = async (u: AdminUser) => {
    if (!user?.id) return;
    // An admin deactivating their own account would lock themselves out.
    if (u.id === user.id && u.is_active) {
      showSnackbar(t("You can't deactivate your own account"), "error");
      return;
    }
    setTogglingId(u.id);
    try {
      await toggleUserStatus(u.id, user.id, !u.is_active);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: !u.is_active } : x)));
      showSnackbar(u.is_active ? t("User deactivated") : t("User activated"), "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("Toggle failed");
      showSnackbar(msg, "error");
    } finally {
      setTogglingId(null);
    }
  };

  // Badge tap: activating is harmless and immediate; deactivating asks first.
  const requestToggle = (u: AdminUser) => {
    if (u.is_active && u.id !== user?.id) setConfirmDeactivate(u);
    else void handleToggle(u);
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
    <div className="flex flex-col min-h-screen" style={{ background: ADMIN_BACKGROUND }}>
      <Toolbar type="back" title={t("User Management")} onBack={() => router.back()} />

      {/* Stats card — TOTAL USERS uppercase, matches Android cv_aggregated_view */}
      <div
        className="mx-3 mt-5 bg-white flex items-center justify-between px-3 py-5"
        style={{ borderRadius: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
      >
        <div>
          <p
            className="uppercase tracking-wide"
            style={{ color: COLORS.darkAquamarineGreen, fontSize: 12 }}
          >
            {t("Total Users")}
          </p>
          <p
            style={{
              color: COLORS.darkAquamarineGreen,
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
          style={{ width: 50, height: 50, backgroundColor: COLORS.mintWhisper, borderRadius: 16 }}
        >
          {/* ic_users.xml — exact Android path, tinted dark_aquamarine_green.
              Original size in Android is 30dp inside a 10dp-padded MaterialCardView. */}
          <svg width="30" height="30" viewBox="0 0 24 24" fill={COLORS.darkAquamarineGreen}>
            <path d="M16,11c1.66,0 2.99,-1.34 2.99,-3S17.66,5 16,5s-3,1.34 -3,3 1.34,3 3,3zM8,11c1.66,0 2.99,-1.34 2.99,-3S9.66,5 8,5 5,6.34 5,8s1.34,3 3,3zM8,13c-2.33,0 -7,1.17 -7,3.5L1,18c0,0.55 0.45,1 1,1h12c0.55,0 1,-0.45 1,-1v-1.5c0,-2.33 -4.67,-3.5 -7,-3.5zM16,13c-0.29,0 -0.62,0.02 -0.97,0.05 0.02,0.01 0.03,0.03 0.04,0.04 1.14,0.83 1.93,1.94 1.93,3.41L17,18c0,0.35 -0.07,0.69 -0.18,1L22,19c0.55,0 1,-0.45 1,-1v-1.5c0,-2.33 -4.67,-3.5 -7,-3.5z" />
          </svg>
        </div>
      </div>

      {/* "Users" section heading (matches Android tv_title_users) */}
      <p className="font-bold ml-3 mt-4" style={{ color: COLORS.raisinBlack, fontSize: 16 }}>
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
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={COLORS.darkSilver}
            style={{ flexShrink: 0 }}
          >
            <path d="M15.5,14h-0.79l-0.28,-0.27C15.41,12.59 16,11.11 16,9.5 16,5.91 13.09,3 9.5,3S3,5.91 3,9.5 5.91,16 9.5,16c1.61,0 3.09,-0.59 4.23,-1.57l0.27,0.28v0.79l5,4.99L20.49,19l-4.99,-5zM9.5,14C7.01,14 5,11.99 5,9.5S7.01,5 9.5,5 14,7.01 14,9.5 11.99,14 9.5,14z" />
          </svg>
          <input
            aria-label={t("Search by name or email")}
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
              fontSize: 14,
              color: COLORS.raisinBlack,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label={t("Clear search")}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 4,
                lineHeight: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={COLORS.darkSilver}>
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
                  border: `1px solid ${active ? COLORS.darkAquamarineGreen : "rgba(5,188,109,0.20)"}`,
                  backgroundColor: active ? COLORS.darkAquamarineGreen : COLORS.white,
                  color: active ? COLORS.white : COLORS.darkAquamarineGreen,
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
            <p className="text-base font-bold mb-2" style={{ color: COLORS.darkAquamarineGreen }}>
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
                    style={{ backgroundColor: COLORS.mintWhisper, borderRadius: 16, padding: 10 }}
                  >
                    {u.is_admin ? (
                      /* ic_admin — shield with face inside */
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill={COLORS.darkAquamarineGreen}
                      >
                        <path d="M17,11c0.34,0 0.67,0.04 1,0.09V7.58c0,-0.8 -0.47,-1.52 -1.2,-1.83l-5.5,-2.4c-0.51,-0.22 -1.09,-0.22 -1.6,0l-5.5,2.4C3.47,6.07 3,6.79 3,7.58v3.6c0,4.54 3.2,8.79 7.5,9.82c0.55,-0.13 1.08,-0.32 1.6,-0.55C11.41,19.47 11,18.28 11,17C11,13.69 13.69,11 17,11z" />
                        <path d="M17,13c-2.21,0 -4,1.79 -4,4c0,2.21 1.79,4 4,4s4,-1.79 4,-4C21,14.79 19.21,13 17,13zM17,14.38c0.62,0 1.12,0.51 1.12,1.12s-0.51,1.12 -1.12,1.12s-1.12,-0.51 -1.12,-1.12S16.38,14.38 17,14.38zM17,19.75c-0.93,0 -1.74,-0.46 -2.24,-1.17c0.05,-0.72 1.51,-1.08 2.24,-1.08s2.19,0.36 2.24,1.08C18.74,19.29 17.93,19.75 17,19.75z" />
                      </svg>
                    ) : (
                      /* ic_user — solid filled person silhouette */
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill={COLORS.darkAquamarineGreen}
                      >
                        <path d="M12,12c2.21,0 4,-1.79 4,-4s-1.79,-4 -4,-4 -4,1.79 -4,4 1.79,4 4,4zM12,14c-2.67,0 -8,1.34 -8,4v1c0,0.55 0.45,1 1,1h14c0.55,0 1,-0.45 1,-1v-1c0,-2.66 -5.33,-4 -8,-4z" />
                      </svg>
                    )}
                  </div>
                  <span
                    className="font-bold uppercase"
                    style={{ color: COLORS.darkAquamarineGreen, fontSize: 12 }}
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
                    requestToggle(u);
                  }}
                  disabled={togglingId === u.id}
                  className="font-bold"
                  style={{
                    backgroundColor: u.is_active ? COLORS.honeydew : COLORS.peachyPink,
                    color: u.is_active ? COLORS.darkAquamarineGreen : COLORS.carminePink,
                    border: `1px solid ${u.is_active ? COLORS.goGreen15 : "rgba(228,74,74,0.20)"}`,
                    borderRadius: 10,
                    padding: "2px 10px",
                    fontSize: 10,
                    cursor: togglingId === u.id ? "not-allowed" : "pointer",
                    opacity: togglingId === u.id ? 0.7 : 1,
                  }}
                >
                  {togglingId === u.id ? "..." : u.is_active ? t("ACTIVE") : t("INACTIVE")}
                </button>
              </div>
              {/* Name — starts after the 44px avatar pill (12 card pad + 44 avatar + 12 gap = 68) */}
              <p
                className="font-bold truncate"
                style={{
                  color: COLORS.raisinBlack,
                  fontSize: 18,
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
                  fill={COLORS.darkSilver}
                  style={{ flexShrink: 0 }}
                >
                  <path d="M20,4L4,4c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2L22,6c0,-1.1 -0.9,-2 -2,-2zM19.6,8.25l-6.54,4.09c-0.65,0.41 -1.47,0.41 -2.12,0L4.4,8.25c-0.25,-0.16 -0.4,-0.43 -0.4,-0.72 0,-0.67 0.73,-1.07 1.3,-0.72L12,11l6.7,-4.19c0.57,-0.35 1.3,0.05 1.3,0.72 0,0.29 -0.15,0.56 -0.4,0.72z" />
                </svg>
                <span className="truncate" style={{ color: COLORS.darkSilver, fontSize: 14 }}>
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
                    fill={COLORS.darkSilver}
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M480,769q119,-107 179.5,-197T720,411q0,-105 -68.5,-174T480,168q-103,0 -171.5,69T240,411q0,71 60.5,161T480,769ZM480,841q-13,0 -24.5,-4.5T433,823q-40,-35 -86.5,-82T260,640q-40,-54 -66,-112.5T168,411q0,-134 89,-224.5T480,96q133,0 222.5,90.5T792,411q0,58 -26.5,117t-66,113q-39.5,54 -86,100.5T527,823q-11,9 -22.5,13.5T480,841ZM480,480q30,0 51,-21t21,-51q0,-30 -21,-51t-51,-21q-30,0 -51,21t-21,51q0,30 21,51t51,21Z" />
                  </svg>
                  <span style={{ color: COLORS.darkSilver, fontSize: 14 }}>
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
        <UserDetailSheet
          adminTogglingId={adminTogglingId}
          getCountryName={getCountryName}
          handleToggle={handleToggle}
          selectedUser={selectedUser}
          setConfirmAdmin={setConfirmAdmin}
          setSelectedUser={setSelectedUser}
          setSheetActive={setSheetActive}
          sheetActive={sheetActive}
          t={t}
          togglingId={togglingId}
          user={user}
        />
      )}

      {/* Deactivate-user confirmation (status badge tap). */}
      {confirmDeactivate && (
        <DeactivateUserDialog
          confirmDeactivate={confirmDeactivate}
          handleToggle={handleToggle}
          setConfirmDeactivate={setConfirmDeactivate}
          t={t}
        />
      )}

      {/* Admin grant/revoke confirmation — a second, explicit yes/no in the UI
          before the user's role actually changes (sits above the detail
          sheet). */}
      {confirmAdmin && (
        <AdminRoleDialog
          confirmAdmin={confirmAdmin}
          handleToggleAdmin={handleToggleAdmin}
          setConfirmAdmin={setConfirmAdmin}
          t={t}
        />
      )}
    </div>
  );
}

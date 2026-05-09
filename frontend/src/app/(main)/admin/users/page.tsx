"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getAdminUsers, toggleUserStatus } from "@/lib/api";
import { formatTotalUsers } from "@/lib/validators";
import Toolbar from "@/components/Toolbar";

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
    <div className="mx-3 my-2 rounded-2xl bg-white p-4 space-y-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
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

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const load = (q = search, s = statusFilter) => {
    if (!user?.id) return;
    setIsLoading(true);
    getAdminUsers(user.id, 1, 50, "", s, q)
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : data?.users ?? data?.items ?? [];
        setUsers(list);
        setTotal(data?.total ?? list.length);
      })
      .catch(() => showSnackbar("Could not load users", "error"))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, [user?.id]);

  const handleToggle = async (u: AdminUser) => {
    if (!user?.id) return;
    setTogglingId(u.id);
    try {
      await toggleUserStatus(u.id, user.id, !u.is_active);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
      showSnackbar(`User ${!u.is_active ? "activated" : "deactivated"}`, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Toggle failed";
      showSnackbar(msg, "error");
    } finally {
      setTogglingId(null);
    }
  };

  const getCountryName = (country: AdminUser["country"]) => {
    if (!country) return "";
    if (typeof country === "string") return country;
    return country.name ?? "";
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F8FAF9" }}>
      <Toolbar type="back" title="User Management" onBack={() => router.back()} />

      {/* Stats bar */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-white"
        style={{ borderBottom: "1px solid #F1F5F9" }}
      >
        <p className="text-sm font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
          Total Users
        </p>
        <p className="text-lg font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
          {formatTotalUsers(total)}
        </p>
      </div>

      {/* Search + filter row */}
      <div className="flex gap-2 px-3 pt-3 pb-1">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              load(e.target.value, statusFilter);
            }}
            placeholder="Search by name or email..."
            className="w-full rounded-2xl px-4 py-2.5 text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary-dark"
            style={{ backgroundColor: "#F1F5F9", color: "#231F20", fontFamily: "Nunito, sans-serif" }}
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => {
              const v = e.target.value as "" | "active" | "inactive";
              setStatusFilter(v);
              load(search, v);
            }}
            className="rounded-2xl px-3 py-2.5 text-sm border-none focus:outline-none appearance-none pr-8"
            style={{ backgroundColor: "#064E3B", color: "white", fontFamily: "Nunito, sans-serif", fontWeight: 700, cursor: "pointer" }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
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
            <p className="text-base font-bold mb-2" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
              No users found
            </p>
          </div>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="mx-3 my-2 rounded-2xl bg-white p-4"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)", cursor: "pointer" }}
              onClick={() => setSelectedUser(u)}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                    {u.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>
                    {u.email_id}
                  </p>
                  {getCountryName(u.country) && (
                    <span
                      className="inline-block text-xs px-2 py-0.5 rounded-full mt-1.5"
                      style={{ backgroundColor: "#F0FDF4", color: "#064E3B", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}
                    >
                      {getCountryName(u.country)}
                    </span>
                  )}
                </div>
                {/* Toggle */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggle(u); }}
                  disabled={togglingId === u.id}
                  className="flex-shrink-0 ml-3 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: u.is_active ? "#05BC6D" : "#E44A4A",
                    color: "white",
                    border: "none",
                    cursor: togglingId === u.id ? "not-allowed" : "pointer",
                    opacity: togglingId === u.id ? 0.7 : 1,
                    fontFamily: "Nunito, sans-serif",
                    minWidth: 72,
                  }}
                >
                  {togglingId === u.id ? "..." : u.is_active ? "Active" : "Inactive"}
                </button>
              </div>
              {u.is_admin && (
                <span
                  className="inline-block text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "#F3E5F5", color: "#6A1B9A", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}
                >
                  Admin
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* User Detail Dialog */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="w-full rounded-t-3xl bg-white px-5 py-6"
            style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                User Details
              </p>
              <button
                onClick={() => setSelectedUser(null)}
                className="flex items-center justify-center rounded-full"
                style={{ width: 32, height: 32, backgroundColor: "#F1F5F9", border: "none", cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="#231F20" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Avatar + name */}
            <div className="flex flex-col items-center mb-5">
              <div
                className="flex items-center justify-center rounded-full mb-3"
                style={{ width: 64, height: 64, backgroundColor: "#F0FDF4" }}
              >
                <span className="text-2xl font-bold" style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}>
                  {selectedUser.name?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              </div>
              <p className="text-lg font-bold" style={{ color: "#231F20", fontFamily: "Nunito, sans-serif" }}>
                {selectedUser.name}
              </p>
              {selectedUser.is_admin && (
                <span
                  className="mt-1 inline-block text-xs px-3 py-0.5 rounded-full"
                  style={{ backgroundColor: "#F3E5F5", color: "#6A1B9A", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}
                >
                  Admin
                </span>
              )}
            </div>

            {/* Details grid */}
            {[
              ["Email", selectedUser.email_id],
              ["Country", getCountryName(selectedUser.country)],
              ["User ID", selectedUser.id],
              ["Status", selectedUser.is_active ? "Active" : "Inactive"],
              ...(selectedUser.created_at ? [["Joined", new Date(selectedUser.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })]] : []),
            ].map(([label, value]) => value ? (
              <div
                key={label}
                className="flex items-start justify-between py-3 border-b"
                style={{ borderColor: "#F1F5F9" }}
              >
                <span className="text-sm font-bold" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}>{label}</span>
                <span
                  className="text-sm font-bold text-right ml-4 flex-1"
                  style={{
                    color: label === "Status" ? (selectedUser.is_active ? "#05BC6D" : "#E44A4A") : "#231F20",
                    fontFamily: "Nunito, sans-serif",
                    wordBreak: "break-all",
                  }}
                >
                  {value}
                </span>
              </div>
            ) : null)}

            {/* Toggle action */}
            <button
              onClick={() => { handleToggle(selectedUser); setSelectedUser(null); }}
              disabled={togglingId === selectedUser.id}
              className="w-full mt-5 py-3.5 rounded-2xl font-bold text-sm"
              style={{
                backgroundColor: selectedUser.is_active ? "#E44A4A" : "#05BC6D",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontFamily: "Nunito, sans-serif",
              }}
            >
              {selectedUser.is_active ? "Deactivate User" : "Activate User"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

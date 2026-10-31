"use client";

// Feed Library Sync — the Connection Settings card (CLIMDES endpoint, auth
// type, header name, token) with its own edit / save flow. Self-contained:
// split out of SyncSettingsTab.tsx (audit B-17).

import { useState } from "react";
import CustomSelect from "@/components/CustomSelect";
import { getFeedSyncSchedulerStatus, updateFeedSyncConfig } from "@/lib/api";
import { COLORS } from "@/lib/colors";
import {
  AUTH_TYPE_OPTIONS,
  SchedulerStatus,
  SyncConfig,
  capitalize,
  cardStyle,
  inputStyle,
} from "./shared";

export interface ConnectionSettingsCardProps {
  // The tab renders this card only once the config has loaded.
  config: SyncConfig;
  setConfig: (c: SyncConfig) => void;
  setStatus: (
    s: SchedulerStatus | ((prev: SchedulerStatus | null) => SchedulerStatus | null)
  ) => void;
  showSnackbar: (msg: string, type?: "success" | "error" | "info") => void;
  t: (source: string) => string;
}

export default function ConnectionSettingsCard({
  config,
  setConfig,
  setStatus,
  showSnackbar,
  t,
}: ConnectionSettingsCardProps) {
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [formEndpoint, setFormEndpoint] = useState("");
  const [formAuthType, setFormAuthType] = useState("none");
  const [formHeaderName, setFormHeaderName] = useState("");
  const [isReplacingToken, setIsReplacingToken] = useState(false);
  const [formToken, setFormToken] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const openSettingsEditor = () => {
    if (!config) return;
    setFormEndpoint(config.endpoint_url ?? "");
    setFormAuthType(config.auth_type || "none");
    setFormHeaderName(config.auth_header_name ?? "");
    setIsReplacingToken(false);
    setFormToken("");
    setSettingsError(null);
    setIsEditingSettings(true);
  };

  const handleSaveSettings = async () => {
    if (!config) return;
    setSettingsError(null);
    // The endpoint must be https — every sync sends the CLIMDES API key /
    // bearer token to it (audit A-10). An http:// endpoint saved earlier has
    // to be corrected before any setting can be saved. The backend should
    // also enforce https and block private / link-local addresses, since it
    // is the one that connects.
    if (formEndpoint.trim() && !/^https:\/\//i.test(formEndpoint.trim())) {
      setSettingsError(t("Endpoint URL must start with https://"));
      return;
    }
    const body: Parameters<typeof updateFeedSyncConfig>[0] = {};
    if (formEndpoint.trim() !== (config.endpoint_url ?? ""))
      body.endpoint_url = formEndpoint.trim();
    if (formAuthType !== config.auth_type)
      body.auth_type = formAuthType as "none" | "api_key" | "bearer";
    if (formAuthType === "api_key" && formHeaderName.trim() !== (config.auth_header_name ?? "")) {
      body.auth_header_name = formHeaderName.trim();
    }
    if (isReplacingToken && formToken.trim()) body.auth_token = formToken.trim();

    if (Object.keys(body).length === 0) {
      setIsEditingSettings(false);
      return;
    }

    setIsSavingSettings(true);
    try {
      const res = await updateFeedSyncConfig(body);
      setConfig(res.data);
      showSnackbar(t("Connection settings saved"), "success");
      setIsEditingSettings(false);
      const statusRes = await getFeedSyncSchedulerStatus();
      setStatus(statusRes.data);
    } catch (err: unknown) {
      setSettingsError(err instanceof Error ? err.message : t("Could not save settings"));
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
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
          {t("Connection Settings")}
        </p>
        {!isEditingSettings && (
          <button
            onClick={openSettingsEditor}
            className="text-xs font-bold px-3 py-1 rounded-full"
            style={{
              backgroundColor: COLORS.darkAquamarineGreen,
              color: COLORS.white,
              border: "none",
              cursor: "pointer",
            }}
          >
            {t("Edit")}
          </button>
        )}
      </div>

      {!isEditingSettings ? (
        <div className="px-4 py-4 space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <span style={{ color: COLORS.darkSilver }}>{t("Endpoint URL")}</span>
            <span className="font-bold text-right break-all" style={{ color: COLORS.raisinBlack }}>
              {config.endpoint_url || t("Not configured")}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span style={{ color: COLORS.darkSilver }}>{t("Auth type")}</span>
            <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
              {AUTH_TYPE_OPTIONS.find((o) => o.value === config.auth_type)?.label ??
                capitalize(config.auth_type)}
            </span>
          </div>
          {config.auth_type === "api_key" && (
            <div className="flex justify-between gap-3">
              <span style={{ color: COLORS.darkSilver }}>{t("Header name")}</span>
              <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
                {config.auth_header_name || "—"}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span style={{ color: COLORS.darkSilver }}>{t("Token")}</span>
            <span className="font-bold" style={{ color: COLORS.raisinBlack }}>
              {config.auth_token_masked || t("Not set")}
            </span>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          <div>
            <label
              htmlFor="sync-endpoint-url"
              className="block text-xs font-bold uppercase tracking-wide mb-1"
              style={{ color: COLORS.darkSilver }}
            >
              {t("Endpoint URL")}
            </label>
            <input
              id="sync-endpoint-url"
              aria-label={t("Endpoint URL")}
              type="text"
              value={formEndpoint}
              onChange={(e) => setFormEndpoint(e.target.value)}
              placeholder={t("https://api.example.com/feed-library")}
              className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <p
              className="text-xs font-bold uppercase tracking-wide mb-1"
              style={{ color: COLORS.darkSilver }}
            >
              {t("Auth type")}
            </p>
            <CustomSelect
              value={formAuthType}
              onChange={setFormAuthType}
              options={AUTH_TYPE_OPTIONS}
              style={{
                backgroundColor: COLORS.americanDiamond,
                borderRadius: 14,
                padding: "10px 12px",
              }}
            />
          </div>
          {formAuthType === "api_key" && (
            <div>
              <label
                htmlFor="sync-header-name"
                className="block text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: COLORS.darkSilver }}
              >
                {t("Header name")}
              </label>
              <input
                id="sync-header-name"
                aria-label={t("Header name")}
                type="text"
                value={formHeaderName}
                onChange={(e) => setFormHeaderName(e.target.value)}
                placeholder={t("X-API-Key")}
                className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <p
              className="text-xs font-bold uppercase tracking-wide mb-1"
              style={{ color: COLORS.darkSilver }}
            >
              {t("Token")}
            </p>
            {!isReplacingToken ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl px-4 py-3 text-sm" style={inputStyle}>
                  {config.auth_token_masked || t("Not set")}
                </div>
                <button
                  onClick={() => setIsReplacingToken(true)}
                  className="text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0"
                  style={{
                    backgroundColor: "transparent",
                    color: COLORS.darkAquamarineGreen,
                    border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
                    cursor: "pointer",
                  }}
                >
                  {t("Replace token")}
                </button>
              </div>
            ) : (
              <input
                aria-label={t("New token")}
                type="password"
                value={formToken}
                onChange={(e) => setFormToken(e.target.value)}
                placeholder={t("Enter new token")}
                autoFocus
                className="w-full rounded-xl px-4 py-3 text-sm border-none focus:outline-none"
                style={inputStyle}
              />
            )}
          </div>

          {settingsError && (
            <p className="text-xs font-bold" style={{ color: COLORS.carminePink }}>
              {settingsError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setIsEditingSettings(false)}
              disabled={isSavingSettings}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{
                backgroundColor: "transparent",
                color: COLORS.darkAquamarineGreen,
                border: `1.5px solid ${COLORS.darkAquamarineGreen}`,
                cursor: "pointer",
              }}
            >
              {t("Cancel")}
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{
                backgroundColor: isSavingSettings
                  ? COLORS.lightGrayNew
                  : COLORS.darkAquamarineGreen,
                color: COLORS.white,
                border: "none",
                cursor: isSavingSettings ? "not-allowed" : "pointer",
              }}
            >
              {isSavingSettings ? t("Saving…") : t("Save changes")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

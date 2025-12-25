import { useState, useEffect, useRef } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Settings, DEFAULT_SETTINGS } from "../lib/app-types";
import { getApiUrl, setApiUrl } from "../lib/sync/api";

const SETTINGS_KEY = "znote-settings";

interface SettingsProps {
  isLoggedIn: boolean;
  onSignIn: (credential: string) => void;
  onSignOut: () => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  syncStatus: "idle" | "syncing" | "error" | "offline";
}

export function SettingsButton({
  isLoggedIn,
  onSignIn,
  onSignOut,
  settings,
  onSettingsChange,
  syncStatus,
}: SettingsProps) {
  const [open, setOpen] = useState(false);
  const [syncUrl, setSyncUrl] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSyncUrl(getApiUrl());
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleThemeChange = (theme: Settings["theme"]) => {
    onSettingsChange({ ...settings, theme });
  };

  const handleDayCutChange = (hour: number) => {
    onSettingsChange({ ...settings, dayCutHour: hour });
  };

  const handleSyncUrlChange = (url: string) => {
    setSyncUrl(url);
    setApiUrl(url);
  };

  const handleGoogleSuccess = (response: { credential?: string }) => {
    if (response.credential) {
      onSignIn(response.credential);
      setOpen(false);
    }
  };

  return (
    <div className="relative text-xs text-foreground/40" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="hover:text-foreground transition-colors"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-5 bg-background border border-foreground/10 rounded p-2 min-w-44 shadow-sm z-50">
          <div className="space-y-2">
            {isLoggedIn ? (
              <button onClick={onSignOut} className="block w-full text-left hover:text-foreground">
                sign out
              </button>
            ) : (
              <div className="py-1">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => console.error("Login failed")}
                  size="small"
                  theme="outline"
                  text="signin"
                  shape="rectangular"
                />
              </div>
            )}

            {isLoggedIn && (
              <div className="text-foreground/30 text-[10px]">
                {syncStatus === "syncing" && "syncing..."}
                {syncStatus === "error" && "sync error"}
                {syncStatus === "offline" && "offline"}
                {syncStatus === "idle" && "synced"}
              </div>
            )}

            <div className="flex gap-1">
              {(["system", "light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleThemeChange(t)}
                  className={settings.theme === t ? "text-foreground" : "hover:text-foreground"}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <span>day @</span>
              <select
                value={settings.dayCutHour}
                onChange={(e) => handleDayCutChange(Number(e.target.value))}
                className="bg-transparent text-foreground/60 outline-none"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 mt-2 border-t border-foreground/10">
              <label className="block text-foreground/30 mb-1">sync server</label>
              <input
                type="text"
                value={syncUrl}
                onChange={(e) => handleSyncUrlChange(e.target.value)}
                placeholder="https://your-server.com"
                className="w-full bg-transparent border border-foreground/10 rounded px-1 py-0.5 text-foreground/60 outline-none focus:border-foreground/30"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (!saved) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

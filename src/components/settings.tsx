"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, DEFAULT_SETTINGS } from "@/lib/types";

const SETTINGS_KEY = "znote-settings";

interface SettingsProps {
  isLoggedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function SettingsButton({
  isLoggedIn,
  onSignIn,
  onSignOut,
  settings,
  onSettingsChange,
}: SettingsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative text-xs text-foreground/40" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="hover:text-foreground transition-colors"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-5 bg-background border border-foreground/10 rounded p-2 min-w-36 shadow-sm z-50">
          <div className="space-y-2">
            {isLoggedIn ? (
              <button onClick={onSignOut} className="block w-full text-left hover:text-foreground">
                sign out
              </button>
            ) : (
              <button onClick={onSignIn} className="block w-full text-left hover:text-foreground">
                sign in
              </button>
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

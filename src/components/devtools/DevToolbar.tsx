"use client";

import { useEffect, useState } from "react";
import {
  Grid2x2,
  SquareDashed,
  Eye,
  SunMoon,
  Bug,
  LayoutGrid,
  RefreshCw,
  Clipboard,
  HardDrive,
  Ruler,
  Menu,
  X,
} from "lucide-react";
import clsx from "clsx";
import useBreakpoint from "./useBreakpoint";
import { usePathname } from "next/navigation";

function useStoredBoolean(key: string, initial = false) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      setValue(stored === "true");
    }
  }, [key]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, String(value));
  }, [key, value]);
  return [value, setValue] as const;
}

export default function DevToolbar() {
  const bp = useBreakpoint();
  const pathname = usePathname();

  const [open, setOpen] = useStoredBoolean("devtools:open", false);
  const [grid, setGrid] = useStoredBoolean("devtools:grid", false);
  const [outline, setOutline] = useStoredBoolean("devtools:outline", false);
  const [focus, setFocus] = useStoredBoolean("devtools:focus", false);
  const [dark, setDark] = useStoredBoolean("devtools:dark", false);

  useEffect(() => {
    document.documentElement.classList.toggle("devtools-outline", outline);
  }, [outline]);

  useEffect(() => {
    document.documentElement.classList.toggle("devtools-focus", focus);
  }, [focus]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "`" && e.ctrlKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  const cols = ["lg", "xl", "2xl"].includes(bp) ? 24 : bp === "md" ? 12 : 8;

  const copyPath = () => {
    navigator.clipboard.writeText(pathname);
  };

  const clearStorage = () => {
    if (window.confirm("Clear localStorage?")) {
      window.localStorage.clear();
    }
  };

  const toggleTheme = () => setDark((d) => !d);

  const openLink = (path: string) => {
    window.location.href = path;
  };

  return (
    <>
      {grid && (
        <div
          className="devtools-grid-overlay"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} />
          ))}
        </div>
      )}
      <div className="pointer-events-none fixed bottom-2 left-2 z-[9999] select-none rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
        {bp}
      </div>
      <div className="fixed bottom-4 right-4 z-[9999]">
        {open ? (
          <div className="w-64 rounded-xl bg-zinc-800/80 p-3 text-white backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">DevTools</span>
              <button
                className="rounded p-1 hover:bg-zinc-700/50"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                data-testid="dt-grid-toggle"
                className={clsx(
                  "flex flex-col items-center rounded p-2",
                  grid ? "bg-zinc-700/60" : "hover:bg-zinc-700/40"
                )}
                onClick={() => setGrid((v) => !v)}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Grid</span>
              </button>
              <button
                data-testid="dt-outline-toggle"
                className={clsx(
                  "flex flex-col items-center rounded p-2",
                  outline ? "bg-zinc-700/60" : "hover:bg-zinc-700/40"
                )}
                onClick={() => setOutline((v) => !v)}
              >
                <SquareDashed className="h-4 w-4" />
                <span>Outline</span>
              </button>
              <button
                data-testid="dt-focus-toggle"
                className={clsx(
                  "flex flex-col items-center rounded p-2",
                  focus ? "bg-zinc-700/60" : "hover:bg-zinc-700/40"
                )}
                onClick={() => setFocus((v) => !v)}
              >
                <Eye className="h-4 w-4" />
                <span>Focus</span>
              </button>
              <button
                data-testid="dt-theme-toggle"
                className={clsx(
                  "flex flex-col items-center rounded p-2",
                  dark ? "bg-zinc-700/60" : "hover:bg-zinc-700/40"
                )}
                onClick={toggleTheme}
              >
                <SunMoon className="h-4 w-4" />
                <span>Theme</span>
              </button>
              <button
                className="flex flex-col items-center rounded p-2 hover:bg-zinc-700/40"
                onClick={() => openLink("/debug/style")}
              >
                <Bug className="h-4 w-4" />
                <span>Style</span>
              </button>
              <button
                className="flex flex-col items-center rounded p-2 hover:bg-zinc-700/40"
                onClick={() => openLink("/create")}
              >
                <Grid2x2 className="h-4 w-4" />
                <span>Create</span>
              </button>
              <button
                className="flex flex-col items-center rounded p-2 hover:bg-zinc-700/40"
                onClick={() => openLink("/coming-soon")}
              >
                <Ruler className="h-4 w-4" />
                <span>Coming</span>
              </button>
              <button
                data-testid="dt-copy-path"
                className="flex flex-col items-center rounded p-2 hover:bg-zinc-700/40"
                onClick={copyPath}
              >
                <Clipboard className="h-4 w-4" />
                <span>Copy</span>
              </button>
              <button
                data-testid="dt-clear-storage"
                className="flex flex-col items-center rounded p-2 hover:bg-zinc-700/40"
                onClick={clearStorage}
              >
                <HardDrive className="h-4 w-4" />
                <span>Storage</span>
              </button>
              <button
                data-testid="dt-refresh"
                className="flex flex-col items-center rounded p-2 hover:bg-zinc-700/40"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
            </div>
            <div className="mt-2 break-all text-[10px] opacity-80">
              {pathname}
            </div>
          </div>
        ) : (
          <button
            className="rounded-full bg-zinc-800/70 p-2 text-white backdrop-blur shadow hover:bg-zinc-700/70"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
      </div>
    </>
  );
}


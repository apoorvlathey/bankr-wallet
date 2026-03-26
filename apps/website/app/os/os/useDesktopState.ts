"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { DAPPS } from "../data/dapps";
import type { DappEntry } from "../data/dapps";
import {
  WindowState,
  WidgetState,
  DesktopPersistedState,
  DEFAULT_INSTALLED_IDS,
  APP_STORE_WINDOW_ID,
  SWAP_WINDOW_ID,
  STAKE_WINDOW_ID,
  WIDGET_STORE_WINDOW_ID,
  type CustomApp,
} from "./types";
import { getWidgetType } from "./widgetRegistry";
import { MENUBAR_HEIGHT, TASKBAR_HEIGHT } from "./win95styles";

const STORAGE_KEY = "@wchan/os-state";
const DEFAULT_WINDOW_SIZE = { w: 900, h: 600 };
const DEFAULT_WINDOW_OFFSET = 40; // cascade offset for new windows

/** System window IDs that should not be persisted to localStorage */
const SYSTEM_WINDOW_IDS = new Set([APP_STORE_WINDOW_ID, SWAP_WINDOW_ID, STAKE_WINDOW_ID, WIDGET_STORE_WINDOW_ID]);

const SYSTEM_WINDOW_NAMES: Record<string, string> = {
  [SWAP_WINDOW_ID]: "Swap WCHAN",
  [STAKE_WINDOW_ID]: "Stake WCHAN",
  [WIDGET_STORE_WINDOW_ID]: "Widget Store",
};

function loadPersistedState(): DesktopPersistedState {
  if (typeof window === "undefined") {
    return { installedAppIds: DEFAULT_INSTALLED_IDS, customApps: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DesktopPersistedState;
      if (Array.isArray(parsed.installedAppIds)) return parsed;
    }
  } catch {}
  return { installedAppIds: DEFAULT_INSTALLED_IDS, customApps: [] };
}

/** Stable window IDs for persisted windows (no Date.now()) */
function stableWindowId(dappId: number | null, customUrl?: string): string {
  if (dappId !== null) return `dapp-${dappId}`;
  if (customUrl) return `custom-${btoa(customUrl).slice(0, 16)}`;
  return `win-${Date.now()}`;
}

function savePersistedState(state: DesktopPersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** Find a DappEntry by ID */
function findDapp(id: number): DappEntry | undefined {
  return DAPPS.find((d) => d.id === id);
}

/** Find a DappEntry by URL (exact or prefix match) */
function findDappByUrl(url: string): DappEntry | undefined {
  return (
    DAPPS.find((d) => d.url === url) ||
    DAPPS.filter((d) => url.startsWith(d.url)).sort(
      (a, b) => b.url.length - a.url.length
    )[0] ||
    undefined
  );
}

export function useDesktopState() {
  const searchParams = useSearchParams();

  // Z-index counter for window stacking
  const nextZIndexRef = useRef(100);
  // Separate counter for cascade positioning (only incremented on new window creation)
  const windowCreationCount = useRef(0);

  // Installed apps (persisted) — start with defaults, hydrate from localStorage
  const [installedAppIds, setInstalledAppIds] = useState<number[]>(DEFAULT_INSTALLED_IDS);

  // Custom installed apps (user-added URLs)
  const [customApps, setCustomApps] = useState<CustomApp[]>([]);

  // Open windows
  const [windows, setWindows] = useState<WindowState[]>([]);

  // Desktop widgets
  const [widgets, setWidgets] = useState<WidgetState[]>([]);

  // Focused window ID
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null);

  // Whether localStorage state has been loaded
  const hydratedRef = useRef(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const persisted = loadPersistedState();
    setInstalledAppIds(persisted.installedAppIds);
    setCustomApps(persisted.customApps ?? []);

    if (persisted.windows?.length) {
      const maxZ = Math.max(...persisted.windows.map((w) => w.zIndex), 99);
      nextZIndexRef.current = maxZ + 1;
      const restoredWindows = persisted.windows.filter((w) => {
        if (w.id === APP_STORE_WINDOW_ID) return false;
        if (w.dappId) return !!findDapp(w.dappId);
        if (w.customUrl) return true;
        return false;
      });
      setWindows(restoredWindows);
    }

    if (persisted.focusedWindowId) {
      setFocusedWindowId(persisted.focusedWindowId);
    }

    // Restore widgets (filter out any with unknown types)
    if (persisted.widgets?.length) {
      const restoredWidgets = persisted.widgets.filter((w) => !!getWidgetType(w.type));
      setWidgets(restoredWidgets);
      const maxWidgetZ = Math.max(...restoredWidgets.map((w) => w.zIndex), nextZIndexRef.current - 1);
      nextZIndexRef.current = Math.max(nextZIndexRef.current, maxWidgetZ + 1);
    }
  }, []);

  // Persist full state on change (skip the initial default render, exclude system windows)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const persistableWindows = windows.filter((w) => !SYSTEM_WINDOW_IDS.has(w.id));
    savePersistedState({ installedAppIds, customApps, windows: persistableWindows, focusedWindowId, widgets });
  }, [installedAppIds, customApps, windows, focusedWindowId, widgets]);

  // Reposition widgets and windows when viewport resizes
  useEffect(() => {
    const handleResize = () => {
      const screenW = window.innerWidth;
      const desktopH = window.innerHeight - MENUBAR_HEIGHT - TASKBAR_HEIGHT;

      // Widgets: recompute x from rightOffset so they track the right edge
      setWidgets((prev) => {
        let changed = false;
        const next = prev.map((w) => {
          const offset = w.rightOffset ?? (screenW - w.position.x);
          let newX = screenW - offset;
          // Clamp to visible bounds
          newX = Math.max(0, Math.min(newX, screenW - w.size.w));
          const newY = Math.max(0, Math.min(w.position.y, desktopH - w.size.h));
          if (newX !== w.position.x || newY !== w.position.y) {
            changed = true;
            return { ...w, position: { x: newX, y: newY }, rightOffset: offset };
          }
          return w;
        });
        return changed ? next : prev;
      });

      // Windows: just clamp to stay visible
      setWindows((prev) => {
        let changed = false;
        const next = prev.map((w) => {
          if (w.isMaximized) return w;
          const maxX = Math.max(0, screenW - Math.min(w.size.w, screenW));
          const maxY = Math.max(0, desktopH - Math.min(w.size.h, desktopH));
          const clampedX = Math.min(w.position.x, maxX);
          const clampedY = Math.min(w.position.y, maxY);
          if (clampedX !== w.position.x || clampedY !== w.position.y) {
            changed = true;
            return { ...w, position: { x: clampedX, y: clampedY } };
          }
          return w;
        });
        return changed ? next : prev;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // On mount: if URL params present, they override persisted windows
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const urlParam = searchParams.get("url");
    if (!urlParam) return;

    const chainParam = searchParams.get("chainId");
    const chainId = chainParam ? Number(chainParam) : undefined;

    const dapp = findDappByUrl(urlParam);
    if (dapp) {
      const existingId = stableWindowId(dapp.id);
      setWindows((prev) => {
        const existing = prev.find((w) => w.id === existingId);
        // If already open (from persisted state), just ensure it's not maximized
        if (existing) {
          return prev.map((w) =>
            w.id === existingId ? { ...w, isMinimized: false } : w
          );
        }
        const win = createWindowState(dapp.id, undefined, undefined, chainId);
        return [...prev, win];
      });
      setFocusedWindowId(existingId);
    } else {
      const newWin = createWindowState(null, urlParam, undefined, chainId);
      setWindows((prev) => {
        const existing = prev.find((w) => w.id === newWin.id);
        if (existing) {
          return prev.map((w) =>
            w.id === newWin.id ? { ...w, isMinimized: false } : w
          );
        }
        return [...prev, newWin];
      });
      setFocusedWindowId(newWin.id);

      // Fetch page title for custom URL windows
      fetch(`/api/meta?url=${encodeURIComponent(urlParam)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.title) {
            setWindows((prev) =>
              prev.map((w) =>
                w.id === newWin.id ? { ...w, customName: data.title } : w
              )
            );
          }
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Create a new WindowState */
  const createWindowState = useCallback(
    (
      dappId: number | null,
      customUrl?: string,
      customName?: string,
      chainId?: number,
      maximized = false
    ): WindowState => {
      const z = nextZIndexRef.current++;
      const cascadeIndex = windowCreationCount.current++ % 8;
      const cascade = cascadeIndex * DEFAULT_WINDOW_OFFSET;
      const dapp = dappId ? findDapp(dappId) : undefined;
      const defaultChain = dapp?.chains[0] ?? 1;

      // Center the window in the desktop area, then apply cascade offset
      const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
      const screenH = typeof window !== "undefined" ? window.innerHeight : 800;
      const desktopH = screenH - MENUBAR_HEIGHT - TASKBAR_HEIGHT;
      const centerX = Math.round((screenW - DEFAULT_WINDOW_SIZE.w) / 2);
      const centerY = Math.round((desktopH - DEFAULT_WINDOW_SIZE.h) / 2);
      const x = Math.max(0, Math.min(centerX + cascade, screenW - DEFAULT_WINDOW_SIZE.w));
      const y = Math.max(0, Math.min(centerY + cascade, desktopH - DEFAULT_WINDOW_SIZE.h));

      return {
        id: stableWindowId(dappId, customUrl),
        dappId,
        customUrl,
        customName,
        position: { x, y },
        size: DEFAULT_WINDOW_SIZE,
        chainId: chainId ?? defaultChain,
        isMinimized: false,
        isMaximized: maximized,
        zIndex: z,
      };
    },
    []
  );

  /** Open a dapp in a new window */
  const openWindow = useCallback(
    (dappId: number, chainId?: number) => {
      // If already open, just focus it
      const existing = windows.find(
        (w) => w.dappId === dappId && !w.customUrl
      );
      if (existing) {
        focusWindow(existing.id);
        if (existing.isMinimized) {
          setWindows((prev) =>
            prev.map((w) =>
              w.id === existing.id ? { ...w, isMinimized: false } : w
            )
          );
        }
        return;
      }

      const win = createWindowState(dappId, undefined, undefined, chainId);
      setWindows((prev) => [...prev, win]);
      setFocusedWindowId(win.id);
    },
    [windows, createWindowState] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Open a custom URL in a new window */
  const openCustomUrl = useCallback(
    (url: string, name?: string, chainId?: number) => {
      const win = createWindowState(null, url, name, chainId);
      setWindows((prev) => [...prev, win]);
      setFocusedWindowId(win.id);
    },
    [createWindowState]
  );

  /** Toggle the App Store window — open if closed, close if open */
  const openAppStore = useCallback(() => {
    const existing = windows.find((w) => w.id === APP_STORE_WINDOW_ID);
    if (existing) {
      closeWindow(APP_STORE_WINDOW_ID);
      return;
    }

    const z = nextZIndexRef.current++;
    const storeW = 960;
    const storeH = 640;
    const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const screenH = typeof window !== "undefined" ? window.innerHeight : 800;
    const desktopH = screenH - MENUBAR_HEIGHT - TASKBAR_HEIGHT;
    const win: WindowState = {
      id: APP_STORE_WINDOW_ID,
      dappId: null,
      position: {
        x: Math.max(0, Math.round((screenW - storeW) / 2)),
        y: Math.max(0, Math.round((desktopH - storeH) / 2)),
      },
      size: { w: storeW, h: storeH },
      chainId: 1,
      isMinimized: false,
      isMaximized: false,
      zIndex: z,
    };
    setWindows((prev) => [...prev, win]);
    setFocusedWindowId(APP_STORE_WINDOW_ID);
  }, [windows]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Open a system window (Swap, Stake, etc.) */
  const openSystemWindow = useCallback(
    (windowId: string) => {
      const existing = windows.find((w) => w.id === windowId);
      if (existing) {
        if (existing.isMinimized) {
          setWindows((prev) =>
            prev.map((w) =>
              w.id === windowId
                ? { ...w, isMinimized: false, zIndex: nextZIndexRef.current++ }
                : w
            )
          );
        } else {
          focusWindow(windowId);
        }
        setFocusedWindowId(windowId);
        return;
      }

      const z = nextZIndexRef.current++;
      const winW = 480;
      const winH = 620;
      const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
      const screenH = typeof window !== "undefined" ? window.innerHeight : 800;
      const desktopH = screenH - MENUBAR_HEIGHT - TASKBAR_HEIGHT;
      const win: WindowState = {
        id: windowId,
        dappId: null,
        customName: SYSTEM_WINDOW_NAMES[windowId] ?? "System",
        position: {
          x: Math.max(0, Math.round((screenW - winW) / 2)),
          y: Math.max(0, Math.round((desktopH - winH) / 2)),
        },
        size: { w: winW, h: winH },
        chainId: 8453, // Base
        isMinimized: false,
        isMaximized: false,
        zIndex: z,
      };
      setWindows((prev) => [...prev, win]);
      setFocusedWindowId(windowId);
    },
    [windows] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Close a window */
  const closeWindow = useCallback(
    (id: string) => {
      setWindows((prev) => prev.filter((w) => w.id !== id));
      setFocusedWindowId((prev) => {
        if (prev !== id) return prev;
        // Focus the next highest z-index window
        const remaining = windows
          .filter((w) => w.id !== id && !w.isMinimized)
          .sort((a, b) => b.zIndex - a.zIndex);
        return remaining[0]?.id ?? null;
      });
    },
    [windows]
  );

  /** Minimize a window */
  const minimizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w))
    );
    setFocusedWindowId((prev) => {
      if (prev !== id) return prev;
      return null;
    });
  }, []);

  /** Maximize / restore a window */
  const maximizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, isMaximized: !w.isMaximized } : w
      )
    );
  }, []);

  /** Focus a window (bring to front, unminimize) */
  const focusWindow = useCallback((id: string) => {
    const z = nextZIndexRef.current++;
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, zIndex: z, isMinimized: false }
          : w
      )
    );
    setFocusedWindowId(id);
  }, []);

  /** Update window position (after drag) */
  const updateWindowPosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, position } : w))
      );
    },
    []
  );

  /** Update window size (after resize) */
  const updateWindowSize = useCallback(
    (id: string, size: { w: number; h: number }, position?: { x: number; y: number }) => {
      setWindows((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const updates: Partial<WindowState> = { size };
          if (position) updates.position = position;
          return { ...w, ...updates };
        })
      );
    },
    []
  );

  /** Switch chain for a window */
  const switchWindowChain = useCallback(
    (id: string, chainId: number) => {
      setWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, chainId } : w))
      );
    },
    []
  );

  /** Install an app to the desktop */
  const installApp = useCallback((dappId: number) => {
    setInstalledAppIds((prev) => {
      if (prev.includes(dappId)) return prev;
      return [...prev, dappId];
    });
  }, []);

  /** Uninstall an app from the desktop */
  const uninstallApp = useCallback((dappId: number) => {
    setInstalledAppIds((prev) => prev.filter((id) => id !== dappId));
  }, []);

  /** Reorder installed apps (move fromIndex to toIndex) */
  const reorderApps = useCallback((fromIndex: number, toIndex: number) => {
    setInstalledAppIds((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  /** Check if an app is installed */
  const isInstalled = useCallback(
    (dappId: number) => installedAppIds.includes(dappId),
    [installedAppIds]
  );

  /** Install a custom URL dapp to the desktop */
  const installCustomApp = useCallback((url: string, name?: string) => {
    let domain = url;
    try { domain = new URL(url).hostname; } catch {}
    const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    setCustomApps((prev) => {
      if (prev.some((a) => a.url === url)) return prev;
      return [...prev, {
        url,
        name: name || domain,
        iconUrl: googleFavicon,
      }];
    });

    // Check if Google favicon is a real icon; if not, fall back to meta API
    const img = new window.Image();
    img.onload = () => {
      // Google returns a tiny 16x16 default globe for unknown domains
      if (img.naturalWidth <= 16) {
        fetch(`/api/meta?url=${encodeURIComponent(url)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data?.favicon) {
              setCustomApps((prev) =>
                prev.map((a) =>
                  a.url === url ? { ...a, iconUrl: data.favicon } : a
                )
              );
            }
          })
          .catch(() => {});
      }
    };
    img.onerror = () => {
      fetch(`/api/meta?url=${encodeURIComponent(url)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.favicon) {
            setCustomApps((prev) =>
              prev.map((a) =>
                a.url === url ? { ...a, iconUrl: data.favicon } : a
              )
            );
          }
        })
        .catch(() => {});
    };
    img.src = googleFavicon;
  }, []);

  /** Edit a custom URL dapp's name and/or URL */
  const editCustomApp = useCallback((oldUrl: string, newUrl: string, newName: string) => {
    let domain = newUrl;
    try { domain = new URL(newUrl).hostname; } catch {}

    setCustomApps((prev) =>
      prev.map((a) => {
        if (a.url !== oldUrl) return a;
        const urlChanged = oldUrl !== newUrl;
        return {
          ...a,
          url: newUrl,
          name: newName || domain,
          // Re-fetch icon if URL changed
          iconUrl: urlChanged
            ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
            : a.iconUrl,
        };
      })
    );

    // Update any open window for this custom URL
    if (oldUrl !== newUrl) {
      const oldWinId = stableWindowId(null, oldUrl);
      const newWinId = stableWindowId(null, newUrl);
      setWindows((prev) =>
        prev.map((w) =>
          w.id === oldWinId
            ? { ...w, id: newWinId, customUrl: newUrl, customName: newName || domain }
            : w
        )
      );

      // Re-fetch icon for new URL
      const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      const img = new window.Image();
      img.onload = () => {
        if (img.naturalWidth <= 16) {
          fetch(`/api/meta?url=${encodeURIComponent(newUrl)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.favicon) {
                setCustomApps((prev) =>
                  prev.map((a) =>
                    a.url === newUrl ? { ...a, iconUrl: data.favicon } : a
                  )
                );
              }
            })
            .catch(() => {});
        }
      };
      img.onerror = () => {
        fetch(`/api/meta?url=${encodeURIComponent(newUrl)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data?.favicon) {
              setCustomApps((prev) =>
                prev.map((a) =>
                  a.url === newUrl ? { ...a, iconUrl: data.favicon } : a
                )
              );
            }
          })
          .catch(() => {});
      };
      img.src = googleFavicon;
    } else {
      // URL didn't change, just update name in windows
      const winId = stableWindowId(null, oldUrl);
      setWindows((prev) =>
        prev.map((w) =>
          w.id === winId ? { ...w, customName: newName || domain } : w
        )
      );
    }
  }, []);

  /** Uninstall a custom URL dapp */
  const uninstallCustomApp = useCallback((url: string) => {
    setCustomApps((prev) => prev.filter((a) => a.url !== url));
    // Also close any open window for this URL
    const winId = stableWindowId(null, url);
    setWindows((prev) => prev.filter((w) => w.id !== winId));
  }, []);

  /** Check if a custom URL is installed */
  const isCustomAppInstalled = useCallback(
    (url: string) => customApps.some((a) => a.url === url),
    [customApps]
  );

  // ── Widget actions ──────────────────────────────────────

  /** Add a widget to the desktop */
  const addWidget = useCallback(
    (type: string) => {
      const def = getWidgetType(type);
      if (!def) return;

      const z = nextZIndexRef.current++;
      const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
      const desktopH =
        (typeof window !== "undefined" ? window.innerHeight : 800) -
        MENUBAR_HEIGHT -
        TASKBAR_HEIGHT;
      const existingCount = widgets.length;
      const cascade = (existingCount % 5) * 40;
      const x = Math.max(0, screenW - def.defaultSize.w - 20 - cascade);
      const y = Math.min(20 + cascade, desktopH - def.defaultSize.h);

      const widget: WidgetState = {
        id: `widget-${type}-${Date.now()}`,
        type,
        position: { x, y: Math.max(0, y) },
        size: def.defaultSize,
        zIndex: z,
        config: null,
        rightOffset: screenW - x,
      };
      setWidgets((prev) => [...prev, widget]);
    },
    [widgets.length]
  );

  /** Remove a widget */
  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  /** Update widget position (after drag) */
  const updateWidgetPosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      const screenW = window.innerWidth;
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, position, rightOffset: screenW - position.x } : w))
      );
    },
    []
  );

  /** Update widget size (after resize) */
  const updateWidgetSize = useCallback(
    (id: string, size: { w: number; h: number }, position?: { x: number; y: number }) => {
      const screenW = window.innerWidth;
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const updates: Partial<WidgetState> = { size };
          if (position) {
            updates.position = position;
            updates.rightOffset = screenW - position.x;
          }
          return { ...w, ...updates };
        })
      );
    },
    []
  );

  /** Update widget config */
  const updateWidgetConfig = useCallback(
    (id: string, config: Record<string, unknown>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, config } : w))
      );
    },
    []
  );

  /** Focus a widget (bring to front) */
  const focusWidget = useCallback((id: string) => {
    const z = nextZIndexRef.current++;
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, zIndex: z } : w))
    );
  }, []);

  /** Toggle the Widget Store window */
  const openWidgetStore = useCallback(() => {
    const existing = windows.find((w) => w.id === WIDGET_STORE_WINDOW_ID);
    if (existing) {
      closeWindow(WIDGET_STORE_WINDOW_ID);
      return;
    }

    const z = nextZIndexRef.current++;
    const storeW = 560;
    const storeH = 480;
    const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const screenH = typeof window !== "undefined" ? window.innerHeight : 800;
    const desktopH = screenH - MENUBAR_HEIGHT - TASKBAR_HEIGHT;
    const win: WindowState = {
      id: WIDGET_STORE_WINDOW_ID,
      dappId: null,
      customName: "Widget Store",
      position: {
        x: Math.max(0, Math.round((screenW - storeW) / 2)),
        y: Math.max(0, Math.round((desktopH - storeH) / 2)),
      },
      size: { w: storeW, h: storeH },
      chainId: 1,
      isMinimized: false,
      isMaximized: false,
      zIndex: z,
    };
    setWindows((prev) => [...prev, win]);
    setFocusedWindowId(WIDGET_STORE_WINDOW_ID);
  }, [windows]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Get installed dapps as DappEntry[] */
  const installedDapps = installedAppIds
    .map(findDapp)
    .filter(Boolean) as DappEntry[];

  return {
    // State
    windows,
    focusedWindowId,
    installedAppIds,
    installedDapps,
    customApps,

    // Window actions
    openWindow,
    openCustomUrl,
    openAppStore,
    openSystemWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    updateWindowPosition,
    updateWindowSize,
    switchWindowChain,

    // App management
    installApp,
    uninstallApp,
    isInstalled,
    reorderApps,
    installCustomApp,
    editCustomApp,
    uninstallCustomApp,
    isCustomAppInstalled,

    // Widget actions
    widgets,
    addWidget,
    removeWidget,
    updateWidgetPosition,
    updateWidgetSize,
    updateWidgetConfig,
    focusWidget,
    openWidgetStore,
  };
}

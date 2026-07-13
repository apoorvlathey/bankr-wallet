import { setupAddressField } from "./addressField";
import { wireBookmarkAction } from "./bookmarkActions";
import { registerContentUpdateListener } from "./contentUpdates";
import { applyBannerBodyOffset } from "./layout";
import { wireBannerMenu } from "./menuActions";
import { currentPagePath, parseEnsAddressInput } from "./pageState";
import {
  getBannerTabContext,
  getBannerTheme,
  scheduleCacheMetadataCapture,
} from "./transport";
import type { AddressField, BannerTabContext } from "./types";
import { buildBanner, mountedBannerHost } from "./view";

let currentContext: BannerTabContext | null = null;
let currentField: AddressField | null = null;
let inputFocused = false;
let refreshStarState: (() => void) | null = null;

function buildCurrentValue(context: BannerTabContext): string {
  return `${context.ensName}${currentPagePath()}`;
}

async function mountBanner(): Promise<void> {
  const context = await getBannerTabContext();
  if (!context) return;
  currentContext = context;
  scheduleCacheMetadataCapture(context);
  if (mountedBannerHost()) return;

  const refs = buildBanner(await getBannerTheme());
  (document.documentElement || document.body).appendChild(refs.host);
  applyBannerBodyOffset();
  refs.urlInput.addEventListener("focus", () => (inputFocused = true));
  refs.urlInput.addEventListener("blur", () => (inputFocused = false));
  const field = setupAddressField(refs.urlInput, {
    shadowRoot: refs.shadow,
    placeholder: "name.eth or name.gwei",
    onSubmit: (text) => {
      const url = parseEnsAddressInput(text);
      if (!url) {
        field.shake();
        return;
      }
      location.assign(url);
    },
    onEscape: () => {
      if (!currentContext) return;
      field.setValue(buildCurrentValue(currentContext));
      refs.urlInput.blur();
    },
  });
  field.setValue(buildCurrentValue(context));
  currentField = field;
  refreshStarState = wireBookmarkAction(refs, context);
  wireBannerMenu(refs, context);
}

function syncFieldFromLocation(): void {
  if (!currentContext || !currentField) return;
  if (!inputFocused) {
    currentField.setValue(buildCurrentValue(currentContext));
  }
  refreshStarState?.();
}

function wireSpaNavigation(): void {
  const onChange = () => {
    if (!mountedBannerHost()) {
      mountBanner().catch(() => undefined);
      return;
    }
    syncFieldFromLocation();
  };
  const patchHistory = (key: "pushState" | "replaceState") => {
    const original = history[key];
    history[key] = function (
      this: History,
      ...args: Parameters<typeof original>
    ) {
      const result = original.apply(this, args as never);
      queueMicrotask(onChange);
      return result;
    } as typeof original;
  };
  patchHistory("pushState");
  patchHistory("replaceState");
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
}

export function initializeEnsBanner(): void {
  registerContentUpdateListener();
  wireSpaNavigation();
  mountBanner().catch((error) => {
    console.warn("[ens-banner] mount failed", error);
  });
}

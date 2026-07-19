import { useState } from "react";
import { CloseIcon, StarIcon } from "./Dapp3SiteCard";

const DISMISSED_STORAGE_KEY =
  "walletchan:browseBookmarkReminderDismissed:v1";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function bookmarkShortcut(): string {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘D" : "Ctrl+D";
}

export default function BookmarkPageReminder() {
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, "1");
    } catch {
      // The in-memory dismissal still applies when storage is unavailable.
    }
  };

  return (
    <p className="bookmark-reminder">
      <span className="bookmark-reminder-icon" aria-hidden="true">
        <StarIcon filled={false} />
      </span>
      <span>Bookmark this page</span>
      <kbd>{bookmarkShortcut()}</kbd>
      <button
        type="button"
        className="bookmark-reminder-dismiss"
        aria-label="Dismiss bookmark reminder"
        title="Dismiss bookmark reminder"
        onClick={dismiss}
      >
        <CloseIcon />
      </button>
    </p>
  );
}

import type { ReactNode } from "react";
import Dapp3SiteIcon from "./Dapp3SiteIcon";

type CardAction = {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  destructive?: boolean;
  disabled?: boolean;
};

export interface Dapp3SiteCardProps {
  iconSrc?: string | null;
  iconFallbackSrc?: string | null;
  label: string;
  title: string;
  subtitle: string;
  onOpen: () => void;
  favoriteAction?: CardAction;
  removeAction?: CardAction;
  reorderAction?: ReactNode;
}

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m6.5 6.5 11 11m0-11-11 11"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function Dapp3SiteCard({
  iconSrc,
  iconFallbackSrc,
  label,
  title,
  subtitle,
  onOpen,
  favoriteAction,
  removeAction,
  reorderAction,
}: Dapp3SiteCardProps) {
  return (
    <article className="site-tile">
      <button
        type="button"
        className="site-tile-open"
        title={`Open ${title}`}
        aria-label={`Open ${title}`}
        onClick={onOpen}
      >
        <Dapp3SiteIcon
          src={iconSrc}
          fallbackSrc={iconFallbackSrc}
          label={label}
        />
        <span className="site-name">{title}</span>
        <span className="site-kind">{subtitle}</span>
      </button>
      {reorderAction}
      {(favoriteAction || removeAction) && (
        <span className="site-tile-actions">
          {favoriteAction && (
            <button
              type="button"
              className={`site-tile-action${favoriteAction.pressed ? " is-active" : ""}`}
              aria-label={favoriteAction.label}
              title={favoriteAction.label}
              aria-pressed={favoriteAction.pressed}
              disabled={favoriteAction.disabled}
              onClick={favoriteAction.onClick}
            >
              <StarIcon filled={Boolean(favoriteAction.pressed)} />
            </button>
          )}
          {removeAction && (
            <button
              type="button"
              className={`site-tile-action${removeAction.destructive ? " is-destructive" : ""}`}
              aria-label={removeAction.label}
              title={removeAction.label}
              disabled={removeAction.disabled}
              onClick={removeAction.onClick}
            >
              <CloseIcon />
            </button>
          )}
        </span>
      )}
    </article>
  );
}

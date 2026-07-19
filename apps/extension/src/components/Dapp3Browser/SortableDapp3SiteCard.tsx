import {
  useSortable,
  type UseSortableArguments,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Dapp3SiteCard, { type Dapp3SiteCardProps } from "./Dapp3SiteCard";

type SortableDapp3SiteCardProps = Dapp3SiteCardProps & {
  sortId: UseSortableArguments["id"];
  onMovePrevious: () => void;
  onMoveNext: () => void;
  isFirst: boolean;
  isLast: boolean;
  reorderDisabled: boolean;
};

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="6" r="1.4" fill="currentColor" />
      <circle cx="16" cy="6" r="1.4" fill="currentColor" />
      <circle cx="8" cy="12" r="1.4" fill="currentColor" />
      <circle cx="16" cy="12" r="1.4" fill="currentColor" />
      <circle cx="8" cy="18" r="1.4" fill="currentColor" />
      <circle cx="16" cy="18" r="1.4" fill="currentColor" />
    </svg>
  );
}

function StepIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === "previous" ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function SortableDapp3SiteCard({
  sortId,
  title,
  onMovePrevious,
  onMoveNext,
  isFirst,
  isLast,
  reorderDisabled,
  ...cardProps
}: SortableDapp3SiteCardProps) {
  const sortable = useSortable({ id: sortId, disabled: reorderDisabled });

  return (
    <div
      ref={sortable.setNodeRef}
      className={`sortable-site-tile${sortable.isDragging ? " is-dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      <Dapp3SiteCard
        {...cardProps}
        title={title}
        reorderAction={
          <span className="site-tile-reorder-tools">
            <button
              type="button"
              className="site-tile-action site-tile-reorder-step"
              aria-label={`Move ${title} to the previous position`}
              disabled={isFirst || reorderDisabled}
              onClick={onMovePrevious}
            >
              <StepIcon direction="previous" />
            </button>
            <button
              ref={sortable.setActivatorNodeRef}
              type="button"
              className="site-tile-action site-tile-reorder"
              aria-label={`Reorder ${title}`}
              title={`Drag to reorder ${title}`}
              disabled={reorderDisabled}
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <DragHandleIcon />
            </button>
            <button
              type="button"
              className="site-tile-action site-tile-reorder-step"
              aria-label={`Move ${title} to the next position`}
              disabled={isLast || reorderDisabled}
              onClick={onMoveNext}
            >
              <StepIcon direction="next" />
            </button>
          </span>
        }
      />
    </div>
  );
}

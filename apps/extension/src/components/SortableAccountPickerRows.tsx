import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Icon, IconButton } from "@chakra-ui/react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Account } from "@/chrome/types";
import { FullScreenPickerGroup } from "@/components/ui";

export interface SortableRenderState {
  dragHandle: ReactNode;
  isDragging: boolean;
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
}

interface SortableAccountPickerRowsProps {
  accounts: Account[];
  label: ReactNode;
  description?: ReactNode;
  getDisplayName: (account: Account) => string;
  onReorder: (accountIds: string[]) => Promise<void>;
  onReorderError: (message: string | null) => void;
  renderAccount: (account: Account, state: SortableRenderState) => ReactNode;
}

function ReorderIcon() {
  return (
    <Icon viewBox="0 0 20 20" boxSize="18px" aria-hidden="true">
      <path
        d="M5 6h10M5 10h10M5 14h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Icon>
  );
}

function SortableAccountRow({
  account,
  displayName,
  renderAccount,
}: {
  account: Account;
  displayName: string;
  renderAccount: SortableAccountPickerRowsProps["renderAccount"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const dragHandle = (
    <IconButton
      aria-label={`Reorder ${displayName}`}
      title={`Drag to reorder ${displayName}`}
      icon={<ReorderIcon />}
      variant="ghost"
      minW="40px"
      w="40px"
      h="40px"
      ms={1}
      flexShrink={0}
      color={isDragging ? "accent.highlight" : "fg.muted"}
      cursor={isDragging ? "grabbing" : "grab"}
      style={{ touchAction: "none" }}
      _hover={{ color: "fg.primary", bg: "surface.raisedHover" }}
      _active={{ color: "accent.highlight", bg: "surface.sunken" }}
      _focusVisible={{
        color: "fg.primary",
        boxShadow: "0 0 0 2px var(--chakra-colors-border-focus)",
      }}
      {...attributes}
      {...listeners}
    />
  );

  return renderAccount(account, {
    dragHandle,
    isDragging,
    setNodeRef,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
    },
  });
}

export default function SortableAccountPickerRows({
  accounts,
  label,
  description,
  getDisplayName,
  onReorder,
  onReorderError,
  renderAccount,
}: SortableAccountPickerRowsProps) {
  const [orderedAccounts, setOrderedAccounts] = useState(accounts);
  const accountIds = useMemo(
    () => orderedAccounts.map((account) => account.id),
    [orderedAccounts],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setOrderedAccounts(accounts);
  }, [accounts]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const previousAccounts = orderedAccounts;
    const oldIndex = previousAccounts.findIndex(({ id }) => id === active.id);
    const newIndex = previousAccounts.findIndex(({ id }) => id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextAccounts = arrayMove(previousAccounts, oldIndex, newIndex);
    setOrderedAccounts(nextAccounts);
    onReorderError(null);
    void onReorder(nextAccounts.map(({ id }) => id)).catch(() => {
      setOrderedAccounts(previousAccounts);
      onReorderError("Couldn’t save account order. Try again.");
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <FullScreenPickerGroup label={label} description={description}>
        <SortableContext items={accountIds} strategy={verticalListSortingStrategy}>
          {orderedAccounts.map((account) => (
            <SortableAccountRow
              key={account.id}
              account={account}
              displayName={getDisplayName(account)}
              renderAccount={renderAccount}
            />
          ))}
        </SortableContext>
      </FullScreenPickerGroup>
    </DndContext>
  );
}

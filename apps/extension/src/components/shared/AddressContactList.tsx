import { AddIcon, DeleteIcon, DragHandleIcon, EditIcon } from "@chakra-ui/icons";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  Flex,
  IconButton,
  Text,
} from "@chakra-ui/react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import type { AddressContact } from "@/chrome/contactBook/repository";
import type { AddressContactIdentity } from "@/hooks/useAddressContactIdentities";
import {
  FullScreenPickerGroup,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { AddressContactAvatar } from "./AddressContactAvatar";
import { AddressContactEditorModal } from "./AddressContactEditorModal";
import { mergeReorderedContactSubset } from "./addressContactListModel";

interface AddressContactListProps {
  contacts: AddressContactIdentity[];
  allContacts: AddressContact[];
  description: string;
  canAddContact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  isFiltering?: boolean;
  selectedAddress?: string;
  onSelectAddress?: (address: string) => void;
  onRemoveContact: (address: string) => Promise<AddressContact[]>;
  onReorderContacts: (addresses: string[]) => Promise<AddressContact[]>;
}

function ContactIdentity({ identity }: { identity: AddressContactIdentity }) {
  return (
    <>
      <ListItemMedia>
        <AddressContactAvatar address={identity.contact.address} avatar={identity.avatar} />
      </ListItemMedia>
      <ListItemContent>
        <ListItemTitle>{identity.contact.label}</ListItemTitle>
        <ListItemDescription fontFamily={identity.secondaryIsAddress ? "mono" : "inherit"}>
          {identity.secondaryText}
        </ListItemDescription>
      </ListItemContent>
    </>
  );
}

interface SortableContactRowProps {
  identity: AddressContactIdentity;
  isFiltering: boolean;
  isSelected: boolean;
  onSelectAddress?: (address: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableContactRow({
  identity,
  isFiltering,
  isSelected,
  onSelectAddress,
  onEdit,
  onDelete,
}: SortableContactRowProps) {
  const { contact } = identity;
  const sortable = useSortable({ id: contact.address, disabled: isFiltering });
  const identityContent = <ContactIdentity identity={identity} />;

  return (
    <ListItem
      ref={sortable.setNodeRef}
      isSelected={isSelected}
      _hover={onSelectAddress ? { bg: "surface.raisedHover" } : undefined}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.72 : 1,
        zIndex: sortable.isDragging ? 2 : undefined,
      }}
    >
      {onSelectAddress ? (
        <Flex
          as="button"
          type="button"
          flex="1 1 auto"
          minW={0}
          align="center"
          gap={3}
          alignSelf="stretch"
          textAlign="start"
          color="inherit"
          bg="transparent"
          borderWidth={0}
          borderRadius="md"
          cursor="pointer"
          aria-label={`Use ${contact.label}, ${contact.address}`}
          onClick={() => onSelectAddress(contact.address)}
          _focus={{ outline: "none" }}
          _focusVisible={{ boxShadow: "0 0 0 2px var(--chakra-colors-border-focus)" }}
        >
          {identityContent}
        </Flex>
      ) : identityContent}
      <ListItemActions>
        <IconButton aria-label={`Edit ${contact.label}`} icon={<EditIcon />} size="sm" variant="ghost" onClick={onEdit} />
        <IconButton aria-label={`Delete ${contact.label}`} icon={<DeleteIcon />} size="sm" variant="ghost" color="status.error.emphasis" onClick={onDelete} />
        <IconButton
          aria-label={isFiltering ? `Clear search to reorder ${contact.label}` : `Reorder ${contact.label}`}
          icon={<DragHandleIcon />}
          size="sm"
          variant="ghost"
          cursor={isFiltering ? "not-allowed" : "grab"}
          isDisabled={isFiltering}
          sx={{ touchAction: "none" }}
          {...sortable.attributes}
          {...sortable.listeners}
        />
      </ListItemActions>
    </ListItem>
  );
}

export function AddressContactList({
  contacts,
  allContacts,
  description,
  canAddContact = false,
  emptyTitle = "No contacts",
  emptyDescription = "Add a contact to recognize this address across WalletChan.",
  isFiltering = false,
  selectedAddress,
  onSelectAddress,
  onRemoveContact,
  onReorderContacts,
}: AddressContactListProps) {
  const [ordered, setOrdered] = useState(contacts);
  const [editor, setEditor] = useState<{ contact?: AddressContact } | null>(null);
  const [deleting, setDeleting] = useState<AddressContact | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => setOrdered(contacts), [contacts]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || isFiltering) return;
    const previous = ordered;
    const from = previous.findIndex(({ contact }) => contact.address === active.id);
    const to = previous.findIndex(({ contact }) => contact.address === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(previous, from, to);
    const fullOrder = mergeReorderedContactSubset(
      allContacts.map((contact) => contact.address),
      previous.map(({ contact }) => contact.address),
      next.map(({ contact }) => contact.address),
    );
    setOrdered(next);
    void onReorderContacts(fullOrder).catch(() => setOrdered(previous));
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <FullScreenPickerGroup
          label="Contacts"
          description={description}
          trailing={canAddContact ? (
            <IconButton
              aria-label="Add contact"
              icon={<AddIcon />}
              size="sm"
              variant="ghost"
              onClick={() => setEditor({})}
            />
          ) : undefined}
        >
          {ordered.length === 0 ? (
            <ListItem>
              <ListItemContent>
                <ListItemTitle>{emptyTitle}</ListItemTitle>
                <ListItemDescription>{emptyDescription}</ListItemDescription>
              </ListItemContent>
            </ListItem>
          ) : (
            <SortableContext items={ordered.map(({ contact }) => contact.address)} strategy={verticalListSortingStrategy}>
              {ordered.map((identity) => (
                <SortableContactRow
                  key={identity.contact.address}
                  identity={identity}
                  isFiltering={isFiltering}
                  isSelected={selectedAddress?.toLowerCase() === identity.contact.address.toLowerCase()}
                  onSelectAddress={onSelectAddress}
                  onEdit={() => setEditor({ contact: identity.contact })}
                  onDelete={() => setDeleting(identity.contact)}
                />
              ))}
            </SortableContext>
          )}
        </FullScreenPickerGroup>
      </DndContext>

      <AddressContactEditorModal
        address={editor?.contact?.address}
        initialLabel={editor?.contact?.label}
        isOpen={Boolean(editor)}
        onClose={() => setEditor(null)}
      />
      <AlertDialog isOpen={Boolean(deleting)} leastDestructiveRef={cancelRef} onClose={() => setDeleting(null)} isCentered>
        <AlertDialogOverlay />
        <AlertDialogContent mx={4}>
          <AlertDialogHeader>Delete contact?</AlertDialogHeader>
          <AlertDialogBody>
            <Text><strong>{deleting?.label}</strong> will stop resolving across WalletChan. The address itself is not affected.</Text>
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRef} variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!deleting) return;
                void onRemoveContact(deleting.address).then(() => setDeleting(null));
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

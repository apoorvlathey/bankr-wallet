import {
  HStack,
  IconButton,
  useDisclosure,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, HamburgerIcon } from "@chakra-ui/icons";
import { useRef } from "react";
import { ActionSheet, AppHeader } from "@/components/ui";

interface ChatHeaderProps {
  title: string;
  onBack: () => void;
  onNewChat: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
}

export function ChatHeader({
  title,
  onBack,
  onNewChat,
  onDelete,
  showDelete = true,
}: ChatHeaderProps) {
  const deleteSheet = useDisclosure();
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <AppHeader
        title={title}
        onBack={onBack}
        backLabel="Back from conversation"
        trailing={
          <HStack spacing={0}>
            <IconButton
              aria-label="Start a new chat"
              icon={<AddIcon boxSize={4} />}
              variant="ghost"
              minW="44px"
              w="44px"
              h="44px"
              onClick={onNewChat}
            />

            {showDelete && onDelete && (
              <IconButton
                ref={moreButtonRef}
                aria-label="Conversation options"
                icon={<HamburgerIcon boxSize={4} />}
                variant="ghost"
                minW="44px"
                w="44px"
                h="44px"
                onClick={deleteSheet.onOpen}
              />
            )}
          </HStack>
        }
      />

      {showDelete && onDelete && (
        <ActionSheet
          isOpen={deleteSheet.isOpen}
          onClose={deleteSheet.onClose}
          finalFocusRef={moreButtonRef}
          title="Conversation options"
          description="Start fresh or remove this conversation from your history."
          choices={[
            {
              id: "new",
              label: "Start a new chat",
              description: "Keep this conversation in your history.",
              icon: <AddIcon />,
            },
            {
              id: "delete",
              label: "Delete conversation",
              description: "This cannot be undone.",
              icon: <DeleteIcon />,
              isDestructive: true,
            },
          ]}
          onSelect={(choiceId) => {
            if (choiceId === "new") {
              onNewChat();
              return;
            }
            if (choiceId === "delete") {
              onDelete();
            }
          }}
        />
      )}
    </>
  );
}

export default ChatHeader;

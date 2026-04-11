import {
  Flex,
  HStack,
  Text,
  IconButton,
  Box,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from "@chakra-ui/react";
import { ArrowBackIcon, AddIcon, DeleteIcon, HamburgerIcon } from "@chakra-ui/icons";
import { useStripTokens } from "@/theme";

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
  // Same dark-strip pair used by other inverted bars across the extension —
  // see useStripTokens for the shared logic.
  const { bg: stripBg, fg: stripFg } = useStripTokens();

  return (
    <Flex
      py={2}
      px={3}
      bg={stripBg}
      alignItems="center"
      position="relative"
    >
      {/* Decorative stripe */}
      <Box
        position="absolute"
        bottom="0"
        left="0"
        right="0"
        h="2px"
        bg="accent.highlight"
      />

      <IconButton
        aria-label="Back"
        icon={<ArrowBackIcon />}
        variant="ghost"
        size="sm"
        color={stripFg}
        _hover={{ bg: "whiteAlpha.200" }}
        onClick={onBack}
        mr={2}
      />

      <Text
        fontWeight="700"
        color={stripFg}
        fontSize="sm"
        flex="1"
        isTruncated
        textTransform="uppercase"
        letterSpacing="wide"
      >
        {title}
      </Text>

      <HStack spacing={1}>
        <IconButton
          aria-label="New chat"
          icon={<AddIcon />}
          variant="ghost"
          size="sm"
          color={stripFg}
          _hover={{ bg: "whiteAlpha.200" }}
          onClick={onNewChat}
        />

        {showDelete && onDelete && (
          <Menu isLazy>
            <MenuButton
              as={IconButton}
              aria-label="More options"
              icon={<HamburgerIcon />}
              variant="ghost"
              size="sm"
              color={stripFg}
              _hover={{ bg: "whiteAlpha.200" }}
            />
            {/* Menu baseStyle (createTheme.ts:494) already paints
                bg/border/borderColor/borderRadius/boxShadow from theme tokens,
                so no inline overrides for those. We DO override the per-item
                hover bg — the default is `accent.highlight` (yellow/amber) and
                that clashes with the destructive red text on this lone item. */}
            <MenuList py={0} minW="150px">
              <MenuItem
                icon={<DeleteIcon color="chart.negative" />}
                _hover={{ bg: "bg.muted" }}
                color="chart.negative"
                fontWeight="700"
                onClick={onDelete}
              >
                Delete Chat
              </MenuItem>
            </MenuList>
          </Menu>
        )}
      </HStack>
    </Flex>
  );
}

export default ChatHeader;

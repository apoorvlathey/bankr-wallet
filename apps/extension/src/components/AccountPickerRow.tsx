import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { Flex, HStack, Text } from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { truncateAddress } from "@/lib/addressUtils";

interface AccountPickerRowProps {
  account: Account;
  displayName: string;
  ensAvatar: string | null;
  secondaryIdentity: string;
  walletTypeLabel: string;
  isSelected: boolean;
  isDisabled?: boolean;
  statusLabel?: string;
  actions?: ReactNode;
  leadingAction?: ReactNode;
  isDragging?: boolean;
  style?: CSSProperties;
  onSelect: () => void;
}

export function getAccountPickerDisplayName(
  account: Account,
  ensName: string | null,
): string {
  return account.displayName || ensName || truncateAddress(account.address);
}

export function getAccountPickerSecondaryIdentity(
  account: Account,
  ensName: string | null,
): string {
  return account.displayName && ensName
    ? `${ensName} · ${truncateAddress(account.address)}`
    : truncateAddress(account.address);
}

/** Shared account-choice row used by the wallet and connection pickers. */
export const AccountPickerRow = forwardRef<HTMLElement, AccountPickerRowProps>(
  function AccountPickerRow(
    {
      account,
      displayName,
      ensAvatar,
      secondaryIdentity,
      walletTypeLabel,
      isSelected,
      isDisabled = false,
      statusLabel,
      actions,
      leadingAction,
      isDragging = false,
      style,
      onSelect,
    },
    ref,
  ) {
    return (
      <ListItem
        ref={ref}
        px={0}
        py={0}
        gap={0}
        isSelected={isSelected}
        isDisabled={isDisabled}
        data-dragging={isDragging ? "" : undefined}
        style={style}
        zIndex={isDragging ? 2 : 0}
        bg={isDragging ? "surface.raisedHover" : undefined}
        boxShadow={isDragging ? "0 8px 20px rgba(0, 0, 0, 0.28)" : undefined}
        transitionProperty="background-color, box-shadow"
        transitionDuration="fast"
        _hover={
          isSelected || isDisabled ? undefined : { bg: "surface.raisedHover" }
        }
      >
        {leadingAction}
        <Flex
          as="button"
          type="button"
          minW={0}
          flex={1}
          minH="64px"
          px={3}
          py={2.5}
          gap={3}
          align="center"
          textAlign="start"
          disabled={isDisabled}
          _focus={{ outline: "none" }}
          _focusVisible={{
            boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
          }}
          _disabled={{ cursor: "wait", opacity: 0.6 }}
          onClick={onSelect}
        >
          <ListItemMedia>
            <AccountAvatar account={account} ensAvatar={ensAvatar} size={36} />
          </ListItemMedia>
          <ListItemContent>
            <HStack spacing={1.5} minW={0}>
              <ListItemTitle noOfLines={1}>{displayName}</ListItemTitle>
              {isSelected && (
                <CheckIcon boxSize={3} color="accent.secondary" flexShrink={0} />
              )}
            </HStack>
            <ListItemDescription fontFamily="mono" noOfLines={1}>
              {secondaryIdentity}
            </ListItemDescription>
            <Text as="span" color="fg.muted" fontSize="xs" lineHeight="1.4">
              {statusLabel || walletTypeLabel}
            </Text>
          </ListItemContent>
        </Flex>
        {actions && (
          <ListItemActions
            pr={2}
            sx={{
              "&& > *:hover": {
                color: "accent.highlight",
                bg: "surface.raisedHover",
              },
            }}
          >
            {actions}
          </ListItemActions>
        )}
      </ListItem>
    );
  },
);

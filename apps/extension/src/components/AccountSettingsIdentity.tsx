import {
  Badge,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import { blo } from "blo";

import type { Account } from "@/chrome/types";
import { CopyButton } from "@/components/CopyButton";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { useAddressContact } from "@/hooks/useAddressContacts";
import { truncateAddress } from "@/lib/addressUtils";

interface AccountSettingsIdentityProps {
  account: Account;
  resolvedName: string | null;
  resolvedAvatar: string | null;
  explorerUrl: string;
}

function accountTypeLabel(account: Account): string {
  if (account.type === "privateKey") return "Private Key";
  if (account.type === "seedPhrase") return `Seed · #${account.derivationIndex}`;
  if (account.type === "impersonator") return "View-Only";
  return "Bankr";
}

function AccountIdentityAvatar({
  account,
  resolvedAvatar,
}: Pick<AccountSettingsIdentityProps, "account" | "resolvedAvatar">) {
  const size = 40;
  const cachedResolvedSrc = useCachedAvatarSrc(resolvedAvatar || "");
  const commonProps = {
    boxSize: `${size}px`,
    minW: `${size}px`,
    border: "1px solid",
    borderColor: "border.default",
  };

  if (resolvedAvatar) {
    return (
      <Image
        {...commonProps}
        src={cachedResolvedSrc || resolvedAvatar}
        alt="Resolved account avatar"
        borderRadius="full"
        objectFit="cover"
      />
    );
  }

  if (account.type === "bankr") {
    return (
      <Image
        {...commonProps}
        src="/bankr-icon.png"
        alt="Bankr account"
        borderRadius="sm"
      />
    );
  }

  return (
    <Image
      {...commonProps}
      src={blo(account.address as `0x${string}`)}
      alt="Account avatar"
      borderRadius="sm"
    />
  );
}

export default function AccountSettingsIdentity({
  account,
  resolvedName,
  resolvedAvatar,
  explorerUrl,
}: AccountSettingsIdentityProps) {
  const { contact } = useAddressContact(account.address);
  const title =
    contact?.label || account.displayName || resolvedName || truncateAddress(account.address);
  const secondaryName = !contact && account.displayName && resolvedName ? resolvedName : null;

  return (
    <HStack spacing={3} align="center" minW={0}>
      <AccountIdentityAvatar account={account} resolvedAvatar={resolvedAvatar} />
      <VStack spacing={0} align="stretch" flex={1} minW={0}>
        <HStack spacing={2} minW={0}>
          <Text
            fontSize="lg"
            fontWeight="600"
            color="fg.primary"
            lineHeight="1.3"
            noOfLines={1}
            flex={1}
            minW={0}
          >
            {title}
          </Text>
          <Badge variant="subtle" fontSize="xs" flexShrink={0}>
            {accountTypeLabel(account)}
          </Badge>
        </HStack>
        <HStack spacing={1} minW={0} color="fg.secondary">
          {secondaryName && (
            <>
              <Text
                fontSize="xs"
                fontWeight="500"
                noOfLines={1}
                minW={0}
                flex="0 1 auto"
              >
                {secondaryName}
              </Text>
              <Text color="fg.muted" fontSize="xs" aria-hidden="true">
                ·
              </Text>
            </>
          )}
          <MiddleTruncatedAddress address={account.address} />
          <CopyButton value={account.address} />
          <IconButton
            as="a"
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View account on explorer"
            icon={<ExternalLinkIcon />}
            size="xs"
            minW="24px"
            w="24px"
            h="24px"
            variant="ghost"
            color="fg.secondary"
            _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
          />
        </HStack>
      </VStack>
    </HStack>
  );
}

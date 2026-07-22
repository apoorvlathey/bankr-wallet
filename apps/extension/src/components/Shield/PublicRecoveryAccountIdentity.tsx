import { HStack, Image, Text, VStack } from "@chakra-ui/react";
import { blo } from "blo";

import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import { truncateAddress } from "@/lib/addressUtils";

interface PublicRecoveryAccountIdentityProps {
  account: Account | null;
  address: string;
  displayName: string | null;
  ensAvatar: string | null;
  secondaryIdentity: string | null;
  size?: number;
}

/** Original-depositor identity shared by public-exit entry and review. */
export default function PublicRecoveryAccountIdentity({
  account,
  address,
  displayName,
  ensAvatar,
  secondaryIdentity,
  size = 36,
}: PublicRecoveryAccountIdentityProps) {
  const primary = displayName || "Original deposit account";
  const secondary = secondaryIdentity || truncateAddress(address);

  return (
    <HStack minW={0} spacing={2.5}>
      {account ? (
        <AccountAvatar account={account} ensAvatar={ensAvatar} size={size} />
      ) : (
        <Image
          src={blo(address as `0x${string}`)}
          alt="Original deposit account avatar"
          boxSize={`${size}px`}
          flexShrink={0}
          borderRadius="md"
        />
      )}
      <VStack minW={0} align="start" spacing={0}>
        <Text w="full" fontSize="xs" fontWeight="700" color="fg.primary" noOfLines={1}>
          {primary}
        </Text>
        <Text
          w="full"
          color="fg.muted"
          fontFamily="mono"
          fontSize="2xs"
          lineHeight="short"
          noOfLines={1}
        >
          {secondary}
        </Text>
      </VStack>
    </HStack>
  );
}

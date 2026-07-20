import { Flex, Image } from "@chakra-ui/react";
import { blo } from "blo";
import type { Account } from "@/chrome/types";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { SafeIcon } from "@/components/shared/AccountTypeIcons";

function BlockieAvatar({ address, size }: { address: string; size: number }) {
  return (
    <Image
      src={blo(address as `0x${string}`)}
      alt="Account avatar"
      boxSize={`${size}px`}
      borderRadius="md"
    />
  );
}

function EnsAvatar({ src, size }: { src: string; size: number }) {
  const cachedSrc = useCachedAvatarSrc(src);

  return (
    <Image
      src={cachedSrc || src}
      alt="ENS avatar"
      boxSize={`${size}px`}
      minW={`${size}px`}
      borderRadius="full"
      objectFit="cover"
    />
  );
}

export function AccountAvatar({
  account,
  ensAvatar,
  size = 32,
}: {
  account: Account;
  ensAvatar: string | null | undefined;
  size?: number;
}) {
  if (ensAvatar) return <EnsAvatar src={ensAvatar} size={size} />;
  if (account.type === "bankr") {
    return (
      <Image
        src="/bankr-icon.png"
        alt="Bankr account"
        boxSize={`${size}px`}
        borderRadius="md"
      />
    );
  }
  if (account.type === "safe") {
    return (
      <Flex
        boxSize={`${size}px`}
        minW={`${size}px`}
        align="center"
        justify="center"
        borderRadius="md"
        bg="status.success.bg"
        color="status.success.fg"
        border="1px solid"
        borderColor="status.success.border"
      >
        <SafeIcon boxSize={`${Math.round(size * 0.62)}px`} />
      </Flex>
    );
  }
  return <BlockieAvatar address={account.address} size={size} />;
}

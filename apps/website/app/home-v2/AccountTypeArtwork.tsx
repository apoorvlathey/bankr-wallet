"use client";

import { Box, Icon, Image } from "@chakra-ui/react";

export type AccountArtworkKind =
  | "seedPhrase"
  | "privateKey"
  | "viewOnly"
  | "ledger"
  | "safe"
  | "bankr";

const SeedIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="22px" display="block">
    <path
      fill="currentColor"
      d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
    />
  </Icon>
);

const KeyIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="22px" display="block">
    <path
      fill="currentColor"
      d="M7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm5.65-4A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65z"
    />
  </Icon>
);

const EyeIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="22px" display="block">
    <path
      fill="currentColor"
      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
    />
  </Icon>
);

const MaskedLogo = ({
  src,
  width,
}: {
  src: string;
  width: string;
}) => (
  <Box
    as="span"
    display="inline-block"
    w={width}
    h="24px"
    flexShrink={0}
    bg="currentColor"
    sx={{
      WebkitMaskImage: `url('${src}')`,
      maskImage: `url('${src}')`,
      WebkitMaskPosition: "center",
      maskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      maskSize: "contain",
    }}
  />
);

export function AccountTypeArtwork({
  kind,
}: {
  kind: AccountArtworkKind;
}) {
  if (kind === "seedPhrase") return <SeedIcon />;
  if (kind === "privateKey") return <KeyIcon />;
  if (kind === "viewOnly") return <EyeIcon />;
  if (kind === "ledger") {
    return (
      <MaskedLogo
        src="/images/home-v2/ledger-lettermark.svg"
        width="22px"
      />
    );
  }
  if (kind === "safe") {
    return (
      <MaskedLogo src="/images/home-v2/safe-logo.svg" width="24px" />
    );
  }

  return (
    <Image
      src="/images/home-v2/bankr-icon.png"
      alt="Bankr"
      boxSize="36px"
      borderRadius="7px"
    />
  );
}

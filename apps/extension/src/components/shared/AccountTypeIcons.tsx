import { Box, Icon } from "@chakra-ui/react";

// Robot icon for Bankr accounts — Material Design "android" silhouette
// (rounded head + two stubby antennae + symmetric eye dots). Reads cleanly
// at small sizes and unambiguously says "bot" without the busy AI-image vibe.
export const RobotIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" display="block" {...props}>
    <path
      fill="currentColor"
      d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"
    />
  </Icon>
);

// Key icon for Private Key accounts — Material Design horizontal key
// (round bow on the right with a teardrop hole + flat shaft + teeth on the
// left). Single recognizable silhouette, no extraneous detail.
export const KeyIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" display="block" {...props}>
    <path
      fill="currentColor"
      d="M7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm5.65-4A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65z"
    />
  </Icon>
);

// Wallet icon for Seed Phrase accounts — Material Design
// "account-balance-wallet" (billfold with a coin slot). Replaces the old
// sprout/leaf icon, which didn't read as "wallet seed" at a glance.
export const SeedIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" display="block" {...props}>
    <path
      fill="currentColor"
      d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
    />
  </Icon>
);

// Ledger / hardware-wallet icon — device screen plus USB connector.
export const HardwareWalletIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" display="block" {...props}>
    <path
      fill="currentColor"
      d="M4 4h14a2 2 0 0 1 2 2v3h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1v3a2 2 0 0 1-2 2H4a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm0 3v10h13V7H4Zm16 5h1v-1h-1v1ZM7 9h7v6H7V9Z"
    />
  </Icon>
);

// Eye icon for Impersonator (view-only) accounts
export const EyeIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" display="block" {...props}>
    <path
      fill="currentColor"
      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
    />
  </Icon>
);

// Official Safe monogram from safe-global/safe-wallet-monorepo. The packaged
// SVG is used as a mask so each WalletChan surface can supply an accessible,
// theme-aware foreground color without redrawing the brand mark.
export const SafeIcon = ({ boxSize = "1em", sx, ...props }: any) => (
  <Box
    as="span"
    display="inline-block"
    flexShrink={0}
    boxSize={boxSize}
    bg="currentColor"
    aria-hidden="true"
    sx={{
      WebkitMaskImage: "url('/safe-logo.svg')",
      maskImage: "url('/safe-logo.svg')",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      maskSize: "contain",
      ...sx,
    }}
    {...props}
  />
);

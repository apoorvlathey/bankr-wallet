import { Box, type BoxProps } from "@chakra-ui/react";

type LedgerLogoVariant = "lettermark" | "wordmark";

const LOGO_ASSETS: Record<LedgerLogoVariant, string> = {
  lettermark: "/ledger-lettermark.svg",
  wordmark: "/ledger-wordmark.svg",
};

const LOGO_ASPECT_RATIOS: Record<LedgerLogoVariant, number> = {
  lettermark: 768.91 / 669.35,
  wordmark: 2000.58 / 669.35,
};

/** Official Ledger brand mark, colored through the active WalletChan theme. */
export function LedgerLogo({
  variant = "wordmark",
  ...props
}: BoxProps & { variant?: LedgerLogoVariant }) {
  const asset = LOGO_ASSETS[variant];
  return (
    <Box
      role="img"
      aria-label="Ledger"
      flexShrink={0}
      color="fg.primary"
      bg="currentColor"
      aspectRatio={LOGO_ASPECT_RATIOS[variant]}
      sx={{
        maskImage: `url(${asset})`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url(${asset})`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
      {...props}
    />
  );
}

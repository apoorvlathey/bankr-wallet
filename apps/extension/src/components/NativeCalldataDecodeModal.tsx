import { useEffect, useRef, useState } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";

import CalldataDecoder from "@/components/CalldataDecoder";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import { AppHeader, AppScreen, ScreenBody } from "@/components/ui";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";

interface NativeCalldataDecodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  calldata: string;
  from: string;
  to: string;
  chainId: number;
}

/**
 * Kept under the legacy export name for compatibility, but rendered as a
 * pushed mobile screen because clear-signing and calldata are scrollable
 * technical destinations rather than a focused confirmation dialog.
 */
export function NativeCalldataDecodeModal({
  isOpen,
  onClose,
  calldata,
  from,
  to,
  chainId,
}: NativeCalldataDecodeModalProps) {
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const explorer = resolvedChain?.explorer || getChainConfig(chainId).explorer;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [clearSigningStatus, setClearSigningStatus] = useState<
    "loading" | "matched" | "absent"
  >("loading");

  useEffect(() => {
    if (!isOpen) return;
    setClearSigningStatus("loading");
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, calldata, to, chainId]);

  if (!isOpen) return null;

  const clearSigningMatched = clearSigningStatus === "matched";

  return (
    <FullScreenPickerLayer>
      <AppScreen aria-labelledby="calldata-screen-title">
        <AppHeader
          title="Transaction data"
          headingId="calldata-screen-title"
          headingRef={headingRef}
          onBack={onClose}
          backLabel="Back to send"
        />
        <ScreenBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
                Review how WalletChan understands the contract interaction.
                Raw calldata remains available in advanced details.
              </Text>
            </Box>

            <Box py={3} borderBottom="1px solid" borderColor="border.subtle">
              <HStack spacing={3} justify="space-between" minW={0} align="center">
                <Text fontSize="xs" color="fg.secondary">Recipient</Text>
                <LabeledAddressPopover
                  address={to}
                  contextLabel="recipient address"
                  explorer={explorer}
                  label={`${to.slice(0, 8)}…${to.slice(-6)}`}
                  maxW="200px"
                />
              </HStack>
            </Box>

            <ClearSigningView
              kind="calldata"
              chainId={chainId}
              from={from}
              to={to}
              calldata={calldata}
              onResolved={(matched) =>
                setClearSigningStatus(matched ? "matched" : "absent")
              }
            />

            {clearSigningStatus !== "loading" && (
              <CalldataDecoder
                calldata={calldata}
                to={to}
                chainId={chainId}
                defaultCollapsed={clearSigningMatched}
              />
            )}
          </VStack>
        </ScreenBody>
      </AppScreen>
    </FullScreenPickerLayer>
  );
}

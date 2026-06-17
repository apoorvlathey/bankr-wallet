import { useEffect, useState } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Switch,
  IconButton,
  Spacer,
  Spinner,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { WALLETCHAN_SITE_HOST } from "@/constants/externalUrls";
import { ThemedCard } from "@/theme";

interface ClearSigningSettingsProps {
  onBack: () => void;
}

export default function ClearSigningSettings({ onBack }: ClearSigningSettingsProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "getClearSigningEnabled" },
      (res: { enabled?: boolean }) => {
        setEnabled(res?.enabled !== false);
      },
    );
  }, []);

  const toggle = () => {
    if (enabled === null || pending) return;
    const next = !enabled;
    setPending(true);
    setEnabled(next);
    chrome.runtime.sendMessage(
      { type: "setClearSigningEnabled", value: next },
      () => setPending(false),
    );
  };

  return (
    <VStack align="stretch" spacing={3} p={3}>
      <HStack>
        <IconButton aria-label="Back" icon={<ArrowBackIcon />} size="sm" onClick={onBack} variant="ghost" />
        <Text fontSize="md" fontWeight="800" color="fg.primary" textTransform="uppercase">
          Clear Signing
        </Text>
      </HStack>

      <ThemedCard p={3}>
        <HStack>
          <VStack align="start" spacing={0.5}>
            <Text fontSize="sm" fontWeight="700" color="fg.primary">
              Use clear-signing descriptors
            </Text>
            <Text fontSize="xs" color="fg.secondary">
              Render a human-readable summary of transactions and EIP-712
              signatures when an ERC-7730 descriptor is available for the
              target contract.
            </Text>
          </VStack>
          <Spacer />
          {enabled === null ? (
            <Spinner size="sm" />
          ) : (
            <Switch isChecked={enabled} onChange={toggle} isDisabled={pending} />
          )}
        </HStack>
      </ThemedCard>

      <Box>
        <Text fontSize="xs" color="fg.muted">
          When enabled, the wallet contacts <Text as="span" fontFamily="mono">{WALLETCHAN_SITE_HOST}</Text> to
          look up descriptors for the contracts you interact with. Disable to
          stop these requests entirely — the raw decoder will still work.
        </Text>
      </Box>
    </VStack>
  );
}

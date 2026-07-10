import { useEffect, useState } from "react";
import {
  VStack,
  HStack,
  Text,
  Switch,
  Spacer,
  Spinner,
} from "@chakra-ui/react";
import { WALLETCHAN_SITE_HOST } from "@/constants/externalUrls";
import { ListItem, ListItemContent, ListItemDescription, ListItemTitle, ListSurface } from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

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
    <SettingsScreenFrame title="Clear signing" onBack={onBack}>
      <VStack align="stretch" spacing={6}>
        <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
          Show a plain-language explanation when WalletChan recognizes a
          transaction or typed signature.
        </Text>

        <ListSurface aria-label="Clear signing preference">
          <ListItem>
            <ListItemContent>
              <ListItemTitle>Use clear-signing descriptors</ListItemTitle>
              <ListItemDescription>
                Use ERC-7730 metadata when it is available for the contract.
              </ListItemDescription>
            </ListItemContent>
            <Spacer />
            {enabled === null ? (
              <Spinner size="sm" />
            ) : (
              <Switch
                aria-label="Use clear-signing descriptors"
                isChecked={enabled}
                onChange={toggle}
                isDisabled={pending}
              />
            )}
          </ListItem>
        </ListSurface>

        <HStack align="start" spacing={3} color="fg.muted">
          <Text fontSize="sm" lineHeight="1.5">
            When enabled, WalletChan contacts{" "}
            <Text as="span" fontFamily="mono" color="fg.secondary">
              {WALLETCHAN_SITE_HOST}
            </Text>{" "}
            to find descriptors for contracts you interact with. Disabling it
            stops those requests; the raw decoder still works.
          </Text>
        </HStack>
      </VStack>
    </SettingsScreenFrame>
  );
}

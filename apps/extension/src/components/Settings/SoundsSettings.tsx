import { useState } from "react";
import { Spacer, Spinner, Switch } from "@chakra-ui/react";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";
import { useSoundsEnabled } from "@/sounds/useSoundsEnabled";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface SoundsSettingsProps {
  onBack: () => void;
}

export default function SoundsSettings({ onBack }: SoundsSettingsProps) {
  const { enabled, setEnabled } = useSoundsEnabled();
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (enabled === null || pending) return;
    setPending(true);
    try {
      await setEnabled(!enabled);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingsScreenFrame title="Sounds" onBack={onBack}>
      <ListSurface aria-label="Sound preference">
        <ListItem>
          <ListItemContent>
            <ListItemTitle>Interaction sounds</ListItemTitle>
            <ListItemDescription>
              Subtle cues for key interactions.
            </ListItemDescription>
          </ListItemContent>
          <Spacer />
          {enabled === null ? (
            <Spinner size="sm" />
          ) : (
            <Switch
              aria-label="Interaction sounds"
              isChecked={enabled}
              onChange={() => void toggle()}
              isDisabled={pending}
            />
          )}
        </ListItem>
      </ListSurface>
    </SettingsScreenFrame>
  );
}

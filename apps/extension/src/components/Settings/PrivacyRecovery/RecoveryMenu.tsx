import { LockIcon, RepeatIcon } from "@chakra-ui/icons";
import { Text, VStack } from "@chakra-ui/react";

import { ListSurface } from "@/components/ui";
import { SettingsRow, SettingsRowListProvider } from "../SettingsRow";
import type { RecoveryStatus } from "./types";

interface Props {
  status: RecoveryStatus;
  notice: string;
  error: string;
  onBackup: () => void;
  onRestore: () => void;
}

export function RecoveryMenu({ status, notice, error, onBackup, onRestore }: Props) {
  const ready = status.success && status.status === "ready";
  return (
    <VStack spacing={4} align="stretch">
      <Text fontSize="sm" color="fg.secondary">
        Back up or restore your Privacy Pools phrase.
      </Text>
      <ListSurface aria-label="Privacy Pools recovery options">
        <SettingsRowListProvider>
          <SettingsRow
            title="Back up current phrase"
            subtitle={ready
              ? "Save the phrase protecting your Privacy Pools funds"
              : "Open Shield once to create a Privacy Pools phrase"}
            icon={<LockIcon boxSize={4} />}
            iconBg="status.warning.tint"
            iconColor="status.warning.emphasis"
            iconDarkColor="status.warning.emphasis"
            iconHoverColor="status.warning.emphasis"
            cornerAccent="highlight"
            showChevron={ready}
            onClick={onBackup}
            disabled={!ready}
          />
          <SettingsRow
            title="Restore existing phrase"
            subtitle={ready
              ? "Back up this phrase, then restore another"
              : "Restore a saved Privacy Pools phrase"}
            icon={<RepeatIcon boxSize={4} />}
            iconBg="status.warning.tint"
            iconColor="status.warning.emphasis"
            iconDarkColor="status.warning.emphasis"
            iconHoverColor="status.warning.emphasis"
            cornerAccent="highlight"
            showChevron
            onClick={onRestore}
          />
        </SettingsRowListProvider>
      </ListSurface>

      {notice ? (
        <Text color="status.success.emphasis" fontSize="sm" aria-live="polite">
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text color="status.error.emphasis" fontSize="sm" aria-live="polite">
          {error}
        </Text>
      ) : null}
    </VStack>
  );
}

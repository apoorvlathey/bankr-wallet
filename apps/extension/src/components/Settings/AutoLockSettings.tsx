import { useState, useEffect } from "react";
import {
  VStack,
  Box,
  Divider,
  FormControl,
  FormLabel,
  Text,
  Select,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { SettingsScreenFrame } from "./SettingsScreenFrame";
import { DEFAULT_AUTO_LOCK_TIMEOUT_MS } from "@/constants/securityPolicy";

interface AutoLockSettingsProps {
  onComplete: () => void;
  onCancel: () => void;
}

// Timeout options in milliseconds
const TIMEOUT_OPTIONS = [
  { label: "1 minute", value: 1 * 60 * 1000 },
  { label: "5 minutes", value: 5 * 60 * 1000 },
  { label: "15 minutes", value: 15 * 60 * 1000 },
  { label: "30 minutes", value: 30 * 60 * 1000 },
  { label: "1 hour", value: 60 * 60 * 1000 },
  { label: "4 hours", value: 4 * 60 * 60 * 1000 },
  { label: "Never", value: 0 },
];

const DEFAULT_TIMEOUT = DEFAULT_AUTO_LOCK_TIMEOUT_MS;

function AutoLockSettings({ onCancel }: AutoLockSettingsProps) {
  const [timeout, setTimeout] = useState<number>(DEFAULT_TIMEOUT);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useThemedToast();

  useEffect(() => {
    // Load current timeout setting
    chrome.runtime.sendMessage({ type: "getAutoLockTimeout" }, (response) => {
      if (response?.timeout !== undefined) {
        setTimeout(response.timeout);
      }
      setIsLoading(false);
    });
  }, []);

  const handleTimeoutChange = (newTimeout: number) => {
    setTimeout(newTimeout);
    chrome.runtime.sendMessage(
      { type: "setAutoLockTimeout", timeout: newTimeout },
      (response) => {
        if (response?.success) {
          toast({
            title: "Auto-lock timeout updated",
            status: "success",
            duration: 2000,
            isClosable: true,
          });
        }
      }
    );
  };

  return (
    <SettingsScreenFrame title="Auto-lock" onBack={onCancel}>
      <VStack spacing={6} align="stretch">
        <FormControl>
          <FormLabel htmlFor="auto-lock-timeout" mb={2}>
            Inactivity timeout
          </FormLabel>
          <Select
            id="auto-lock-timeout"
            value={timeout}
            onChange={(e) => handleTimeoutChange(Number(e.target.value))}
            isDisabled={isLoading}
            aria-describedby={timeout === 0 ? "auto-lock-warning" : undefined}
          >
            {TIMEOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormControl>

        {timeout === 0 && (
          <VStack
            id="auto-lock-warning"
            role="status"
            align="stretch"
            spacing={3}
          >
            <Divider />
            <Box>
              <Text
                color="status.warning.fg"
                fontSize="sm"
                fontWeight="600"
                mb={1}
              >
                No inactivity timeout
              </Text>
              <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
                WalletChan will not lock because of inactivity. It remains
                unlocked across service-worker restarts when secure session
                storage is available. Closing the browser or locking manually
                still requires you to unlock again. A biometric session opened
                before selecting Never may need one more unlock to establish
                secure resume.
              </Text>
            </Box>
          </VStack>
        )}
      </VStack>
    </SettingsScreenFrame>
  );
}

export default AutoLockSettings;

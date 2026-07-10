import { useState, useEffect } from "react";
import {
  VStack,
  HStack,
  Text,
  Select,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { TimeIcon, WarningIcon } from "@chakra-ui/icons";
import { ScreenSection } from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

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

const DEFAULT_TIMEOUT = 0; // Never (infinite) by default

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
        <ScreenSection
          title="Lock after inactivity"
          description="Choose how long WalletChan stays unlocked after you stop using it. Changes are saved immediately."
        >
          <HStack color="fg.secondary" spacing={2} mb={3}>
            <TimeIcon boxSize={4} />
            <Text as="label" htmlFor="auto-lock-timeout" fontSize="sm" fontWeight="600">
              Inactivity period
            </Text>
          </HStack>
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
        </ScreenSection>

        {timeout === 0 && (
          <HStack
            id="auto-lock-warning"
            align="start"
            spacing={3}
            bg="status.warning.tint"
            color="status.warning.fg"
            border="1px solid"
            borderColor="status.warning.border"
            borderRadius="md"
            p={3}
          >
            <WarningIcon mt={0.5} flexShrink={0} />
            <Text fontSize="sm" lineHeight="1.5">
              WalletChan will stay unlocked until you lock it manually or close
              the browser.
            </Text>
          </HStack>
        )}
      </VStack>
    </SettingsScreenFrame>
  );
}

export default AutoLockSettings;

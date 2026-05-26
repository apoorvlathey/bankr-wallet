import { useState, useEffect } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Select,
  IconButton,
  Spacer,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ArrowBackIcon, TimeIcon } from "@chakra-ui/icons";
import { ThemedCard } from "@/theme";

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
    <VStack spacing={4} align="stretch">
      {/* Header */}
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onCancel}
        />
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          Auto-Lock
        </Text>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        Choose how long the wallet stays unlocked after entering your password.
      </Text>

      <ThemedCard weight="medium" p={4}>
        <VStack spacing={3} align="stretch">
          <HStack spacing={3}>
            <Box p={2} bg="accent.secondary" color="accentFg.secondary">
              <TimeIcon boxSize={4} />
            </Box>
            <Box>
              <Text fontWeight="700" color="text.primary">
                Lock Wallet After
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                Wallet locks after this idle time
              </Text>
            </Box>
          </HStack>

          <Select
            value={timeout}
            onChange={(e) => handleTimeoutChange(Number(e.target.value))}
            isDisabled={isLoading}
            bg="surface.raised"
            border="3px solid"
            borderColor="border.default"
            color="fg.primary"
            fontWeight="700"
            _hover={{ borderColor: "border.default" }}
            _focus={{ borderColor: "border.focus", boxShadow: "none" }}
          >
            {TIMEOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </VStack>
      </ThemedCard>

      {timeout === 0 && (
        <ThemedCard
          weight="medium"
          p={3}
          bg="accent.highlight"
          borderColor="border.default"
        >
          <Text color="accentFg.highlight" fontSize="sm" fontWeight="700">
            ⚠️ Your wallet will stay unlocked until you manually lock it or close the browser.
          </Text>
        </ThemedCard>
      )}
    </VStack>
  );
}

export default AutoLockSettings;

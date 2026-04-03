import { useState, useEffect } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  IconButton,
  Spacer,
  Button,
  Badge,
  Code,
} from "@chakra-ui/react";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import { ArrowBackIcon } from "@chakra-ui/icons";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from "@/constants/externalUrls";

interface OllamaSettingsProps {
  onComplete: () => void;
  onCancel: () => void;
}

interface OllamaSettings {
  enabled: boolean;
  baseUrl: string;
  modelName: string;
}

function OllamaSettings({ onCancel }: OllamaSettingsProps) {
  const [settings, setSettings] = useState<OllamaSettings>({
    enabled: false,
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    modelName: DEFAULT_OLLAMA_MODEL,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "unknown" | "connected" | "error"
  >("unknown");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const toast = useBauhausToast();

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "getOllamaSettings" }, (response) => {
      if (response) {
        setSettings(response);
      }
      setIsLoading(false);
    });
  }, []);

  const saveSettings = (updates: Partial<OllamaSettings>) => {
    const updated = { ...settings, ...updates };
    setSettings(updated);
    chrome.runtime.sendMessage({
      type: "saveOllamaSettings",
      settings: updated,
    });
  };

  const testConnection = () => {
    setIsTesting(true);
    setConnectionStatus("unknown");
    chrome.runtime.sendMessage(
      { type: "checkOllamaAvailability", baseUrl: settings.baseUrl },
      (response) => {
        setIsTesting(false);
        if (response?.available) {
          setConnectionStatus("connected");
          setAvailableModels(response.models || []);
          const hasModel = (response.models || []).some((m: string) =>
            m.startsWith(settings.modelName)
          );
          toast({
            title: hasModel
              ? "Connected — model found"
              : `Connected — model "${settings.modelName}" not found`,
            description: hasModel
              ? undefined
              : `Available: ${response.models.join(", ") || "none"}`,
            status: hasModel ? "success" : "warning",
            duration: 3000,
            isClosable: true,
          });
        } else {
          setConnectionStatus("error");
          setAvailableModels([]);
          toast({
            title: "Cannot reach Ollama",
            description: "Make sure Ollama is running with `ollama serve`",
            status: "error",
            duration: 4000,
            isClosable: true,
          });
        }
      }
    );
  };

  if (isLoading) return null;

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
        <Text
          fontSize="lg"
          fontWeight="900"
          color="text.primary"
          textTransform="uppercase"
          letterSpacing="tight"
        >
          Local AI Chat
        </Text>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        Use a local Ollama model for AI chat on Private Key and Seed Phrase
        accounts.
      </Text>

      {/* Enable Toggle */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
      >
        <HStack justify="space-between">
          <Box>
            <Text fontWeight="700" color="text.primary">
              Enable Local AI
            </Text>
            <Text fontSize="xs" color="text.secondary" fontWeight="500">
              Chat with Nani via Ollama
            </Text>
          </Box>
          <Button
            size="sm"
            bg={settings.enabled ? "bauhaus.yellow" : "gray.200"}
            color="bauhaus.black"
            border="2px solid"
            borderColor="bauhaus.black"
            borderRadius="0"
            fontWeight="700"
            fontSize="xs"
            textTransform="uppercase"
            _hover={{ opacity: 0.8 }}
            onClick={() => saveSettings({ enabled: !settings.enabled })}
          >
            {settings.enabled ? "ON" : "OFF"}
          </Button>
        </HStack>
      </Box>

      {/* Connection Settings */}
      <Box
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
        opacity={settings.enabled ? 1 : 0.5}
        pointerEvents={settings.enabled ? "auto" : "none"}
      >
        <VStack spacing={3} align="stretch">
          <Box>
            <Text fontWeight="700" color="text.primary" fontSize="sm" mb={1}>
              Ollama URL
            </Text>
            <Input
              value={settings.baseUrl}
              onChange={(e) => {
                setSettings({ ...settings, baseUrl: e.target.value });
                setConnectionStatus("unknown");
              }}
              onBlur={() => saveSettings({ baseUrl: settings.baseUrl })}
              placeholder={DEFAULT_OLLAMA_BASE_URL}
              bg="bauhaus.white"
              border="3px solid"
              borderColor="bauhaus.black"
              fontWeight="600"
              fontSize="sm"
              fontFamily="mono"
              _hover={{ borderColor: "bauhaus.black" }}
              _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
            />
          </Box>

          <Box>
            <Text fontWeight="700" color="text.primary" fontSize="sm" mb={1}>
              Model Name
            </Text>
            <Input
              value={settings.modelName}
              onChange={(e) => {
                setSettings({ ...settings, modelName: e.target.value });
                setConnectionStatus("unknown");
              }}
              onBlur={() => saveSettings({ modelName: settings.modelName })}
              placeholder={DEFAULT_OLLAMA_MODEL}
              bg="bauhaus.white"
              border="3px solid"
              borderColor="bauhaus.black"
              fontWeight="600"
              fontSize="sm"
              _hover={{ borderColor: "bauhaus.black" }}
              _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
            />
          </Box>

          {/* Test Connection */}
          <HStack spacing={2}>
            <Button
              onClick={testConnection}
              isLoading={isTesting}
              loadingText="Testing..."
              bg="bauhaus.blue"
              color="white"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="3px 3px 0px 0px #121212"
              borderRadius="0"
              fontWeight="700"
              fontSize="sm"
              textTransform="uppercase"
              _hover={{
                transform: "translateY(-1px)",
                boxShadow: "4px 4px 0px 0px #121212",
              }}
              _active={{
                transform: "translate(1px, 1px)",
                boxShadow: "none",
              }}
            >
              Test Connection
            </Button>
            {connectionStatus === "connected" && (
              <Badge
                bg="green.100"
                color="green.700"
                border="2px solid"
                borderColor="green.500"
                fontWeight="700"
                fontSize="xs"
              >
                Connected
              </Badge>
            )}
            {connectionStatus === "error" && (
              <Badge
                bg="red.100"
                color="red.700"
                border="2px solid"
                borderColor="red.500"
                fontWeight="700"
                fontSize="xs"
              >
                Not Reachable
              </Badge>
            )}
          </HStack>

          {/* Available models */}
          {connectionStatus === "connected" && availableModels.length > 0 && (
            <Box>
              <Text fontSize="xs" color="text.secondary" fontWeight="600" mb={1}>
                Available models:
              </Text>
              <Text fontSize="xs" color="text.secondary" fontFamily="mono">
                {availableModels.join(", ")}
              </Text>
            </Box>
          )}
        </VStack>
      </Box>

      {/* Setup Guide */}
      <Box
        bg="bauhaus.yellow"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        p={4}
      >
        <Text fontWeight="700" color="bauhaus.black" fontSize="sm" mb={2}>
          Setup Guide
        </Text>
        <VStack spacing={1} align="stretch">
          <Text fontSize="xs" color="bauhaus.black" fontWeight="500">
            1. Install Ollama from{" "}
            <Text as="span" fontWeight="700">
              ollama.com
            </Text>
          </Text>
          <Text fontSize="xs" color="bauhaus.black" fontWeight="500">
            2. Pull the nani model:
          </Text>
          <Code
            bg="bauhaus.black"
            color="bauhaus.yellow"
            p={2}
            fontSize="xs"
            fontWeight="600"
          >
            ollama pull hf.co/NaniDAO/nani-qwen-3.5-2B-gguf-q4km:Q4_K_M
          </Code>
          <Code
            bg="bauhaus.black"
            color="bauhaus.yellow"
            p={2}
            fontSize="xs"
            fontWeight="600"
          >
            ollama cp hf.co/NaniDAO/nani-qwen-3.5-2B-gguf-q4km:Q4_K_M nani
          </Code>
          <Text fontSize="xs" color="bauhaus.black" fontWeight="500">
            3. Start Ollama (must allow extension origin):
          </Text>
          <Code
            bg="bauhaus.black"
            color="bauhaus.yellow"
            p={2}
            fontSize="xs"
            fontWeight="600"
          >
            OLLAMA_ORIGINS=* ollama serve
          </Code>
        </VStack>
      </Box>
    </VStack>
  );
}

export default OllamaSettings;

import { useState, useEffect, useRef, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  InputGroup,
  InputRightElement,
  IconButton,
  Image,
  Tooltip,
  Icon,
  Link,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@chakra-ui/react";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import {
  ViewIcon,
  ViewOffIcon,
  LockIcon,
  WarningTwoIcon,
  BellIcon,
} from "@chakra-ui/icons";

// Sidepanel icon
const SidePanelIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 2v14h5V5h-5zM4 5v14h10V5H4z"
    />
  </Icon>
);

// Fullscreen icon
const FullScreenIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
    />
  </Icon>
);

interface UnlockScreenProps {
  onUnlock: () => void;
  pendingTxCount: number;
  pendingSignatureCount: number;
  pendingBatchCount?: number;
}

function UnlockScreen({
  onUnlock,
  pendingTxCount,
  pendingSignatureCount,
  pendingBatchCount = 0,
}: UnlockScreenProps) {
  const toast = useBauhausToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [sidePanelSupported, setSidePanelSupported] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState(false);
  const [isInSidePanel, setIsInSidePanel] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isAgentPasswordEnabled, setIsAgentPasswordEnabled] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const {
    isOpen: isResetModalOpen,
    onOpen: onResetModalOpen,
    onClose: onResetModalClose,
  } = useDisclosure();

  useEffect(() => {
    const checkSidePanelSupport = async () => {
      return new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "isSidePanelSupported" },
          (response) => {
            resolve(response?.supported || false);
          },
        );
      });
    };

    const checkSidePanelMode = async () => {
      return new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage({ type: "getSidePanelMode" }, (response) => {
          resolve(response?.enabled || false);
        });
      });
    };

    const checkAgentPasswordEnabled = async () => {
      return new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "isAgentPasswordEnabled" },
          (response) => {
            resolve(response?.enabled || false);
          },
        );
      });
    };

    const init = async () => {
      const supported = await checkSidePanelSupport();
      setSidePanelSupported(supported);

      if (supported) {
        const mode = await checkSidePanelMode();
        setSidePanelMode(mode);
      }

      // Detect if currently in sidepanel
      setIsInSidePanel(window.innerHeight > 620);

      // Check if agent password is enabled
      const agentEnabled = await checkAgentPasswordEnabled();
      setIsAgentPasswordEnabled(agentEnabled);
    };

    init();
  }, []);

  const toggleSidePanelMode = async () => {
    if (sidePanelMode) {
      // DISABLING: persist and close immediately
      chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: false });
      window.close();
    } else {
      // ENABLING: open sidepanel, persist, close popup — all fire-and-forget
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const windowId = tabs[0]?.windowId;
        if (!windowId) return;

        chrome.sidePanel.open({ windowId });
        chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: true });
        window.close();
      } catch (error) {
        console.warn("Failed to open sidepanel:", error);
      }
    }
  };

  const openFullScreen = () => {
    // Open extension in a new tab
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
  };

  const handleUnlock = async () => {
    if (!password) {
      setError("Password is required");
      passwordInputRef.current?.focus();
      return;
    }

    setIsUnlocking(true);
    setError("");

    chrome.runtime.sendMessage(
      { type: "unlockWallet", password },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          onUnlock();
        } else {
          setError(result.error || "Invalid password");
          setIsUnlocking(false);
          passwordInputRef.current?.focus();
        }
      },
    );
  };

  const handleResetExtension = () => {
    setIsResetting(true);
    chrome.runtime.sendMessage({ type: "resetExtension" }, (result) => {
      setIsResetting(false);
      if (result?.success) {
        onResetModalClose();
        toast({
          title: "Extension reset",
          description: "Please set up your API key and password again",
          status: "info",
          duration: 4000,
          isClosable: true,
        });
        // Reload the extension popup to show the setup screen
        window.location.reload();
      } else {
        toast({
          title: "Reset failed",
          description: result?.error || "Failed to reset extension",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      }
    });
  };

  return (
    <Box
      h="100%"
      bg="bg.base"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      pt={4}
      pb={16}
      px={6}
      position="relative"
    >
      {/* Geometric decoration - top left */}
      <Box
        position="absolute"
        top={4}
        left={4}
        w="12px"
        h="12px"
        bg="bauhaus.red"
        border="2px solid"
        borderColor="bauhaus.black"
      />

      {/* Geometric decoration - top right triangle */}
      <Box
        position="absolute"
        top={4}
        right={sidePanelSupported ? 20 : 12}
        w="0"
        h="0"
        borderLeft="6px solid transparent"
        borderRight="6px solid transparent"
        borderBottom="12px solid"
        borderBottomColor="bauhaus.blue"
      />

      {/* Top right controls - fullscreen and sidepanel toggle */}
      <HStack position="absolute" top={3} right={3} spacing={1}>
        <Tooltip label="Open in fullscreen" placement="bottom">
          <IconButton
            aria-label="Open in fullscreen"
            icon={<FullScreenIcon />}
            variant="ghost"
            size="sm"
            onClick={openFullScreen}
          />
        </Tooltip>
        {sidePanelSupported && (
          <Tooltip
            label={
              sidePanelMode
                ? "Switch to popup mode"
                : "Switch to sidepanel mode"
            }
            placement="bottom"
          >
            <IconButton
              aria-label={
                sidePanelMode
                  ? "Switch to popup mode"
                  : "Switch to sidepanel mode"
              }
              icon={<SidePanelIcon />}
              variant="ghost"
              size="sm"
              onClick={toggleSidePanelMode}
            />
          </Tooltip>
        )}
      </HStack>

      {/* Pending requests banner */}
      {(pendingTxCount > 0 || pendingSignatureCount > 0 || pendingBatchCount > 0) && (
        <Box
          position="absolute"
          top={3}
          left={3}
          right={sidePanelSupported ? 20 : 12}
          bg="bauhaus.yellow"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          px={3}
          py={2}
        >
          <HStack spacing={2}>
            <Box
              p={1.5}
              bg="bauhaus.black"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <BellIcon boxSize={3.5} color="bauhaus.yellow" />
            </Box>
            <Text
              flex="1"
              textAlign="center"
              fontSize="xs"
              fontWeight="700"
              color="bauhaus.black"
              textTransform="uppercase"
            >
              {(() => {
                const parts: string[] = [];
                if (pendingTxCount > 0) parts.push(`${pendingTxCount} tx`);
                if (pendingBatchCount > 0) parts.push(`${pendingBatchCount} batch`);
                if (pendingSignatureCount > 0) parts.push(`${pendingSignatureCount} sig`);
                if (parts.length > 1) return `${parts.join(", ")} pending`;
                if (pendingTxCount > 0) return `${pendingTxCount} pending request${pendingTxCount > 1 ? "s" : ""}`;
                if (pendingBatchCount > 0) return `${pendingBatchCount} batch request${pendingBatchCount > 1 ? "s" : ""}`;
                return `${pendingSignatureCount} signature${pendingSignatureCount > 1 ? "s" : ""}`;
              })()}
            </Text>
          </HStack>
        </Box>
      )}

      <VStack spacing={6} w="full" maxW="280px">
        {/* Logo in geometric container */}
        <Box
          p={4}
          bg="bauhaus.white"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="6px 6px 0px 0px #121212"
          transform="rotate(-3deg)"
          position="relative"
        >
          <Image src="walletchan-animated.gif" w="4.5rem" />
          {/* Lock badge */}
          <Box
            position="absolute"
            bottom="-14px"
            right="-14px"
            p={1.5}
            bg="bauhaus.blue"
            border="2px solid"
            borderColor="bauhaus.black"
            boxShadow="2px 2px 0px 0px #121212"
          >
            <LockIcon boxSize={3.5} color="bauhaus.white" />
          </Box>
        </Box>

        <VStack spacing={1}>
          <Text
            fontSize="xl"
            fontWeight="900"
            color="text.primary"
            textTransform="uppercase"
            letterSpacing="tight"
          >
            WalletChan
          </Text>
          <Text
            fontSize="sm"
            color="text.secondary"
            textAlign="center"
            fontWeight="500"
          >
            Enter your password to unlock
          </Text>
        </VStack>

        {/* Main form card */}
        <Box
          w="full"
          p={4}
          bg="bauhaus.white"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="6px 6px 0px 0px #121212"
          position="relative"
        >
          {/* Corner decoration */}
          <Box
            position="absolute"
            top="-2px"
            right="-2px"
            w="10px"
            h="10px"
            bg="bauhaus.yellow"
            border="2px solid"
            borderColor="bauhaus.black"
          />

          <VStack spacing={3} w="full">
            <InputGroup>
              <Input
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                autoFocus
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlock();
                }}
                isDisabled={isUnlocking}
                bg="bauhaus.white"
                border="2px solid"
                borderColor={error ? "bauhaus.red" : "bauhaus.black"}
                borderRadius="0"
                _hover={{
                  borderColor: error ? "bauhaus.red" : "bauhaus.black",
                }}
                _focus={{
                  borderColor: error ? "bauhaus.red" : "bauhaus.blue",
                  boxShadow: error
                    ? "3px 3px 0px 0px #D02020"
                    : "3px 3px 0px 0px #1040C0",
                }}
              />
              <InputRightElement>
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  color="text.secondary"
                />
              </InputRightElement>
            </InputGroup>

            {error && (
              <VStack spacing={2} w="full">
                <Box
                  w="full"
                  bg="bauhaus.red"
                  border="2px solid"
                  borderColor="bauhaus.black"
                  p={2}
                >
                  <HStack>
                    <WarningTwoIcon color="white" boxSize={4} />
                    <Text color="white" fontSize="sm" fontWeight="700">
                      {error}
                    </Text>
                  </HStack>
                </Box>
                <Link
                  fontSize="sm"
                  color="text.secondary"
                  fontWeight="500"
                  _hover={{
                    color: "bauhaus.blue",
                    textDecoration: "underline",
                  }}
                  onClick={onResetModalOpen}
                  cursor="pointer"
                >
                  Forgot Password?
                </Link>
              </VStack>
            )}

            <Button
              variant="primary"
              w="full"
              onClick={handleUnlock}
              isLoading={isUnlocking}
              loadingText="Unlocking..."
            >
              Unlock
            </Button>
          </VStack>
        </Box>

        {isAgentPasswordEnabled && (
          <Text
            fontSize="xs"
            color="text.tertiary"
            fontWeight="500"
            textAlign="center"
          >
            Master or Agent password accepted
          </Text>
        )}
      </VStack>

      {/* Reset Extension Modal */}
      <Modal isOpen={isResetModalOpen} onClose={onResetModalClose} isCentered>
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent
          bg="bauhaus.white"
          border="4px solid"
          borderColor="bauhaus.black"
          borderRadius="0"
          boxShadow="8px 8px 0px 0px #121212"
          mx={4}
        >
          <ModalHeader
            color="text.primary"
            fontSize="md"
            pb={2}
            textTransform="uppercase"
            letterSpacing="wider"
          >
            <Box display="flex" alignItems="center" gap={2}>
              <Box
                p={1}
                bg="bauhaus.yellow"
                border="2px solid"
                borderColor="bauhaus.black"
              >
                <WarningTwoIcon color="bauhaus.black" />
              </Box>
              Reset Extension?
            </Box>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={3} align="start">
              <Text color="text.secondary" fontSize="sm" fontWeight="500">
                This will clear all your stored data including:
              </Text>
              <Box pl={4} borderLeft="4px solid" borderColor="bauhaus.red">
                <Text color="text.secondary" fontSize="sm">
                  Your encrypted API key
                </Text>
                <Text color="text.secondary" fontSize="sm">
                  Your wallet address
                </Text>
                <Text color="text.secondary" fontSize="sm">
                  Transaction history
                </Text>
              </Box>
              <Box
                w="full"
                p={3}
                bg="bauhaus.yellow"
                border="2px solid"
                borderColor="bauhaus.black"
              >
                <Text color="bauhaus.black" fontSize="sm" fontWeight="700">
                  You will need to enter your Bankr API key and set up a new
                  password again.
                </Text>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              variant="secondary"
              size="sm"
              onClick={onResetModalClose}
              isDisabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleResetExtension}
              isLoading={isResetting}
              loadingText="Resetting..."
            >
              Reset Extension
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Footer */}
      <HStack
        spacing={1}
        justify="center"
        position="absolute"
        bottom={4}
        left={0}
        right={0}
      >
        <Text fontSize="sm" color="text.tertiary" fontWeight="500">
          Built by
        </Text>
        <Link
          display="flex"
          alignItems="center"
          gap={1}
          color="bauhaus.blue"
          fontWeight="700"
          _hover={{ color: "bauhaus.red" }}
          onClick={() => {
            chrome.tabs.create({ url: "https://x.com/apoorveth" });
          }}
        >
          <Box
            as="svg"
            viewBox="0 0 24 24"
            w="14px"
            h="14px"
            fill="currentColor"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </Box>
          <Text fontSize="sm" textDecor="underline">
            @apoorveth
          </Text>
        </Link>
      </HStack>
    </Box>
  );
}

export default memo(UnlockScreen);

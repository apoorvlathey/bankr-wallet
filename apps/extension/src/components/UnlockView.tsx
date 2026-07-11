import { useRef } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import {
  BellIcon,
  ExternalLinkIcon,
  HamburgerIcon,
  LockIcon,
  ViewIcon,
  ViewOffIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import BrandWordmark from "@/components/BrandWordmark";
import { ActionSheet, AppScreen, ScreenBody } from "@/components/ui";
import { FingerprintIcon } from "@/components/Settings/icons";
import UnlockMascot from "@/components/UnlockMascot";
import type { UnlockMascotState } from "@/components/unlockMascotState";

interface UnlockViewProps {
  password: string;
  showPassword: boolean;
  error: string;
  isUnlocking: boolean;
  isPasskeyUnlocking: boolean;
  mascotState: UnlockMascotState;
  passkeySupported: boolean;
  passkeyConfigured: boolean;
  pendingRequestLabel?: string;
  sidePanelSupported: boolean;
  sidePanelMode: boolean;
  passwordInputRef: React.RefObject<HTMLInputElement>;
  onPasswordChange: (password: string) => void;
  onTogglePassword: () => void;
  onUnlock: () => void;
  onPasskeyUnlock: () => void;
  onSetupBiometric: () => void;
  onOpenReset: () => void;
  onOpenFullscreen: () => void;
  onToggleSidePanel: () => void;
  resetDialog: {
    isOpen: boolean;
    isResetting: boolean;
    onClose: () => void;
    onConfirm: () => void;
  };
}

const SidePanelIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path fill="currentColor" d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 2v14h5V5h-5zM4 5v14h10V5H4z" />
  </Icon>
);

const UnlockMascotSpotlight = ({ state }: { state: UnlockMascotState }) => (
  <Box
    position="relative"
    w="clamp(120px, 36vw, 148px)"
    h="clamp(120px, 36vw, 148px)"
    mx="auto"
    aria-hidden="true"
  >
    <Box
      position="absolute"
      inset="12%"
      bg="status.warning.tint"
      border="1px solid"
      borderColor="accent.highlight"
      borderRadius="12px"
      opacity={0.8}
      transform="rotate(-7deg)"
    />
    <Box position="relative" w="full" h="full">
      <UnlockMascot state={state} />
    </Box>
    <Box
      position="absolute"
      right="0"
      bottom="2px"
      display="grid"
      placeItems="center"
      boxSize="34px"
      bg="accent.highlight"
      color="accentFg.highlight"
      border="3px solid"
      borderColor="surface.base"
      borderRadius="8px"
      transform="rotate(4deg)"
    >
      <LockIcon boxSize="16px" />
    </Box>
  </Box>
);

export default function UnlockView({
  password,
  showPassword,
  error,
  isUnlocking,
  isPasskeyUnlocking,
  mascotState,
  passkeySupported,
  passkeyConfigured,
  pendingRequestLabel,
  sidePanelSupported,
  sidePanelMode,
  passwordInputRef,
  onPasswordChange,
  onTogglePassword,
  onUnlock,
  onPasskeyUnlock,
  onSetupBiometric,
  onOpenReset,
  onOpenFullscreen,
  onToggleSidePanel,
  resetDialog,
}: UnlockViewProps) {
  const options = useDisclosure();
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const isIncorrectPassword = /^(invalid|incorrect) password$/i.test(error);
  const passwordErrorLabel = isIncorrectPassword
    ? "Incorrect password"
    : error === "Password is required"
      ? "Password required"
      : error;

  return (
    <AppScreen>
      <HStack
        as="header"
        minH="56px"
        px={4}
        spacing={0}
        bg="surface.raised"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        flexShrink={0}
      >
        <Box w="44px" aria-hidden="true" />
        <BrandWordmark as="h1" flex={1} textAlign="center" />
        <IconButton
          ref={optionsButtonRef}
          aria-label="App options"
          icon={<HamburgerIcon />}
          variant="ghost"
          minW="44px"
          h="44px"
          onClick={options.onOpen}
        />
      </HStack>

      <ScreenBody
        display="flex"
        flexDirection="column"
        justifyContent="center"
        px={5}
        py={6}
      >
        <VStack w="full" maxW="360px" mx="auto" spacing={5} align="stretch">
          {pendingRequestLabel && (
            <HStack
              role="status"
              px={3}
              py={2.5}
              borderWidth="1px"
              borderColor="status.warning.border"
              borderRadius="md"
              bg="status.warning.bg"
              color="status.warning.fg"
              spacing={2.5}
            >
              <BellIcon aria-hidden="true" />
              <Text fontSize="sm" fontWeight="600">{pendingRequestLabel}</Text>
            </HStack>
          )}

          <UnlockMascotSpotlight state={mascotState} />

          <Box
            as="form"
            onSubmit={(event: React.FormEvent<HTMLDivElement>) => {
              event.preventDefault();
              onUnlock();
            }}
          >
            <VStack spacing={3} align="stretch">
              <FormControl isInvalid={!!error}>
                <FormLabel
                  htmlFor="unlock-password"
                  mb={4}
                  color="fg.primary"
                  fontSize="lg"
                  fontWeight="600"
                  lineHeight="1.3"
                  textAlign="center"
                >
                  Enter password to unlock
                </FormLabel>
                <Box position="relative">
                  <Text
                    id="unlock-password-error"
                    role={passwordErrorLabel ? "alert" : undefined}
                    aria-live="polite"
                    position="absolute"
                    top="-17px"
                    right={0}
                    maxW="70%"
                    color="chart.negative"
                    fontSize="xs"
                    fontWeight="600"
                    lineHeight="1.25"
                    noOfLines={1}
                    visibility={passwordErrorLabel ? "visible" : "hidden"}
                  >
                    {passwordErrorLabel || "Password error"}
                  </Text>
                  <InputGroup
                    className={isIncorrectPassword ? "unlock-password-shake" : undefined}
                  >
                    <Input
                      id="unlock-password"
                      ref={passwordInputRef}
                      name="password"
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(event) => onPasswordChange(event.target.value)}
                      isDisabled={isUnlocking}
                      aria-describedby={passwordErrorLabel ? "unlock-password-error" : undefined}
                    />
                    <InputRightElement h="full">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        size="sm"
                        variant="ghost"
                        onClick={onTogglePassword}
                      />
                    </InputRightElement>
                  </InputGroup>
                </Box>
              </FormControl>

              <Button
                type="submit"
                variant="brand"
                w="full"
                minH="46px"
                isLoading={isUnlocking}
                loadingText="Unlocking…"
                isDisabled={isPasskeyUnlocking}
              >
                Unlock
              </Button>

              {passkeySupported && passkeyConfigured && (
                <Button
                  type="button"
                  variant="secondary"
                  w="full"
                  minH="46px"
                  leftIcon={<FingerprintIcon boxSize={5} />}
                  onClick={onPasskeyUnlock}
                  isLoading={isPasskeyUnlocking}
                  loadingText="Biometric verifying…"
                  isDisabled={isUnlocking}
                >
                  Use biometric unlock
                </Button>
              )}

              <Box minH="28px" textAlign="center">
                {isIncorrectPassword && (
                  <Button
                    type="button"
                    variant="link"
                    color="fg.secondary"
                    fontSize="sm"
                    fontWeight="500"
                    onClick={onOpenReset}
                  >
                    Forgot password?
                  </Button>
                )}
              </Box>
            </VStack>
          </Box>

          {passkeySupported && !passkeyConfigured && (
            <Button
              type="button"
              variant="ghost"
              leftIcon={<FingerprintIcon boxSize={4} />}
              onClick={onSetupBiometric}
            >
              Set up biometric unlock
            </Button>
          )}
        </VStack>
      </ScreenBody>

      <ActionSheet
        isOpen={options.isOpen}
        onClose={options.onClose}
        finalFocusRef={optionsButtonRef}
        title="App options"
        choices={[
          ...(sidePanelSupported
            ? [{
                id: "panel",
                label: sidePanelMode ? "Switch to Popup" : "Switch to Side Panel",
                icon: <SidePanelIcon />,
              }]
            : []),
          {
            id: "fullscreen",
            label: "Open in fullscreen tab",
            icon: <ExternalLinkIcon aria-hidden="true" />,
          },
        ]}
        onSelect={(id) => {
          if (id === "panel") onToggleSidePanel();
          if (id === "fullscreen") onOpenFullscreen();
        }}
      />

      <Modal isOpen={resetDialog.isOpen} onClose={resetDialog.onClose} isCentered>
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>Reset WalletChan?</ModalHeader>
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <HStack align="start" color="status.error.fg" spacing={2.5}>
                <WarningTwoIcon mt={0.5} aria-hidden="true" />
                <Text fontSize="sm" fontWeight="600">
                  This permanently removes wallet data stored by this extension.
                </Text>
              </HStack>
              <Text fontSize="sm" color="fg.secondary">
                Your API key, imported private keys, recovery phrases, accounts, and transaction
                history will be cleared. Make sure every recovery phrase and private key is backed up.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              variant="secondary"
              onClick={resetDialog.onClose}
              isDisabled={resetDialog.isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={resetDialog.onConfirm}
              isLoading={resetDialog.isResetting}
              loadingText="Resetting…"
            >
              Reset wallet
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AppScreen>
  );
}

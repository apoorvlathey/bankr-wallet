import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
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
  usePrefersReducedMotion,
  VStack,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  BellIcon,
  ChevronRightIcon,
  LockIcon,
  ViewIcon,
  ViewOffIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import BrandWordmark from "@/components/BrandWordmark";
import { AppScreen, ScreenBody } from "@/components/ui";
import DisplayModeMenu from "@/components/DisplayModeMenu";
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
    hasShieldData: boolean;
    backupVerified: boolean;
    shieldAcknowledged: boolean;
    onShieldAcknowledgedChange: (checked: boolean) => void;
    onClose: () => void;
    onConfirm: () => void;
  };
}

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

const pendingBellRing = keyframes`
  0%, 5%, 42%, 100% { transform: rotate(0deg); }
  10% { transform: rotate(14deg); } 16% { transform: rotate(-12deg); }
  22% { transform: rotate(9deg); } 28% { transform: rotate(-7deg); }
  34% { transform: rotate(4deg); } 39% { transform: rotate(-2deg); }
`;

const PendingUnlockNotice = ({ label }: { label: string }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  return (
    <HStack
      role="status"
      aria-label={`${label}. Unlock to review.`}
      w="full" maxW="360px" mx="auto"
      px={3} py={1.5} spacing={2}
      bg="surface.raisedHover"
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="lg"
    >
      <BellIcon
        boxSize={4}
        ml={1}
        flexShrink={0}
        color="accent.highlight"
        aria-hidden="true"
        transformOrigin="50% 18%"
        animation={
          prefersReducedMotion
            ? undefined
            : `${pendingBellRing} 2.2s cubic-bezier(0.77, 0, 0.175, 1) 180ms infinite`
        }
      />
      <Text
        flex="1"
        textAlign="center"
        color="fg.primary"
        fontSize="xs"
        fontWeight="600"
      >
        {label}
      </Text>
      <ChevronRightIcon boxSize={5} color="fg.secondary" flexShrink={0} />
    </HStack>
  );
};

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
  const isIncorrectPassword = /^(invalid|incorrect) password$/i.test(error);
  const shouldShakePassword =
    isIncorrectPassword || error === "Password is required";
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
        <DisplayModeMenu
          sidePanelSupported={sidePanelSupported}
          sidePanelMode={sidePanelMode}
          onToggleSidePanel={onToggleSidePanel}
          onOpenFullscreen={onOpenFullscreen}
        />
      </HStack>

      <ScreenBody
        display="flex"
        flexDirection="column"
        px={5}
        py={4}
      >
        {pendingRequestLabel && <PendingUnlockNotice label={pendingRequestLabel} />}

        <VStack
          w="full"
          maxW="360px"
          mx="auto"
          flex="1 0 auto"
          justify="center"
          spacing={5}
          align="stretch"
          py={6}
        >
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
                  mb={6}
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
                    className={shouldShakePassword ? "unlock-password-shake" : undefined}
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
              {resetDialog.hasShieldData ? (
                <Checkbox
                  isChecked={resetDialog.shieldAcknowledged}
                  onChange={(event) =>
                    resetDialog.onShieldAcknowledgedChange(event.target.checked)}
                >
                  <Text fontSize="sm">
                    I saved my Shield phrase, or accept that Shield funds may be lost.
                  </Text>
                  {resetDialog.backupVerified ? (
                    <Text mt={1} fontSize="xs" color="fg.secondary">
                      The Shield phrase was previously revealed in Settings.
                    </Text>
                  ) : null}
                </Checkbox>
              ) : null}
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
              isDisabled={resetDialog.hasShieldData && !resetDialog.shieldAcknowledged}
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

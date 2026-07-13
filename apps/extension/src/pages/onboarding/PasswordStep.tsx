import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from "@chakra-ui/react";
import { LockIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { OnboardingCanvas, OnboardingFooter, OnboardingHeader } from "./OnboardingShell";
import {
  MAX_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
} from "@/constants/securityPolicy";

type Errors = { password?: string; confirmPassword?: string };

export function PasswordStep({
  password,
  confirmPassword,
  showPassword,
  errors,
  isSubmitting,
  onPasswordChange,
  onConfirmPasswordChange,
  onTogglePassword,
  onBack,
  onContinue,
}: {
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  errors: Errors;
  isSubmitting: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const submitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") onContinue();
  };

  return (
    <OnboardingCanvas
      header={<OnboardingHeader onBack={onBack} step={2} />}
      footer={
        <OnboardingFooter>
          <Button
            variant="primary"
            size="lg"
            w="full"
            onClick={onContinue}
            isLoading={isSubmitting}
            loadingText="Creating wallet…"
          >
            Create wallet
          </Button>
        </OnboardingFooter>
      }
    >
      <VStack align="stretch" spacing={6}>
        <VStack align="stretch" spacing={1.5}>
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            Protect your wallet
          </Text>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
            Create a password to encrypt your WalletChan credentials on this device.
          </Text>
        </VStack>

        <VStack align="stretch" spacing={5}>
          <FormControl isInvalid={!!errors.password}>
            <FormLabel fontSize="sm" color="fg.primary" fontWeight="600">Password</FormLabel>
            <InputGroup>
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder={`At least ${MIN_NEW_PASSWORD_LENGTH} characters`}
                autoFocus
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
                onChange={(event) => onPasswordChange(event.target.value)}
                onKeyDown={submitOnEnter}
                pr="3rem"
              />
              <InputRightElement>
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={onTogglePassword}
                  color="fg.secondary"
                  tabIndex={-1}
                />
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage color="chart.negative">{errors.password}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={!!errors.confirmPassword}>
            <FormLabel fontSize="sm" color="fg.primary" fontWeight="600">Confirm password</FormLabel>
            <Input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              placeholder="Enter the same password again"
              autoComplete="new-password"
              maxLength={MAX_PASSWORD_LENGTH}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              onKeyDown={submitOnEnter}
            />
            <FormErrorMessage color="chart.negative">{errors.confirmPassword}</FormErrorMessage>
          </FormControl>
        </VStack>

        <Box p={3.5} bg="surface.raised" border="1px solid" borderColor="border.default" borderRadius="lg">
          <Box display="flex" alignItems="flex-start" gap={3}>
            <LockIcon color="accent.secondary" mt={0.5} flexShrink={0} />
            <VStack align="stretch" spacing={1}>
              <Text fontSize="sm" fontWeight="600">WalletChan cannot recover this password</Text>
              <Text color="fg.secondary" fontSize="xs" lineHeight="1.5">
                If you forget it, you will need to reset the extension and import your accounts again.
              </Text>
            </VStack>
          </Box>
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}

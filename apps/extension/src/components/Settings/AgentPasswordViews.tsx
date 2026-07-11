import type { RefObject } from "react";
import {
  Badge,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CheckIcon,
  CloseIcon,
  LockIcon,
  ViewIcon,
  ViewOffIcon,
  WarningIcon,
} from "@chakra-ui/icons";

import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

function PermissionRow({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <ListItem density="compact">
      <ListItemContent>
        <HStack spacing={2} color={allowed ? "status.success.fg" : "chart.negative"}>
          {allowed ? <CheckIcon boxSize={3.5} /> : <CloseIcon boxSize={3.5} />}
          <Text fontSize="sm" fontWeight="500" color="fg.secondary">
            {label}
          </Text>
        </HStack>
      </ListItemContent>
      <ListItemMeta>{allowed ? "Allowed" : "Blocked"}</ListItemMeta>
    </ListItem>
  );
}

interface StatusViewProps {
  enabled: boolean;
  agentSession: boolean;
  onBack: () => void;
  onManage: () => void;
}

export function AgentPasswordStatusView({
  enabled,
  agentSession,
  onBack,
  onManage,
}: StatusViewProps) {
  return (
    <SettingsScreenFrame
      title="Agent password"
      onBack={onBack}
      trailing={
        <Badge
          bg={enabled ? "status.success.bg" : "surface.sunken"}
          color={enabled ? "status.success.fg" : "fg.muted"}
          border="1px solid"
          borderColor={enabled ? "status.success.border" : "border.default"}
          borderRadius="full"
          fontSize="xs"
          fontWeight="600"
          px={2.5}
          py={1}
        >
          {enabled ? "Enabled" : "Off"}
        </Badge>
      }
      primaryAction={
        !agentSession ? (
          <Button variant={enabled ? "danger" : "brand"} onClick={onManage}>
            {enabled ? "Remove agent password" : "Set agent password"}
          </Button>
        ) : undefined
      }
    >
      <VStack spacing={5} align="stretch">
        <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
          Create a limited password for trusted automation. It can approve
          wallet actions but can never reveal private keys.
        </Text>
        {agentSession && (
          <HStack
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
              Unlock with the master password to manage this setting.
            </Text>
          </HStack>
        )}
        <ListSurface aria-label="Agent password access">
          <ListItem>
            <ListItemMedia><LockIcon boxSize={5} /></ListItemMedia>
            <ListItemContent>
              <ListItemTitle>{enabled ? "Agent access is ready" : "Agent access is off"}</ListItemTitle>
              <ListItemDescription>
                {enabled
                  ? "Trusted agents can unlock with the limited password."
                  : "Only your master password can unlock the wallet."}
              </ListItemDescription>
            </ListItemContent>
          </ListItem>
          <PermissionRow label="Sign transactions" allowed />
          <PermissionRow label="Sign messages" allowed />
          <PermissionRow label="Reveal private keys" allowed={false} />
        </ListSurface>
      </VStack>
    </SettingsScreenFrame>
  );
}

interface SetViewProps {
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  errors: { agentPassword?: string; confirmPassword?: string };
  submitting: boolean;
  passwordInputRef: RefObject<HTMLInputElement>;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onToggleVisibility: () => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function SetAgentPasswordView(props: SetViewProps) {
  return (
    <SettingsScreenFrame
      title="Set agent password"
      onBack={props.onBack}
      primaryAction={<Button variant="primary" onClick={props.onSubmit} isLoading={props.submitting}>Enable agent access</Button>}
      secondaryAction={<Button variant="secondary" onClick={props.onBack}>Cancel</Button>}
    >
      <VStack spacing={6} align="stretch">
        <VStack align="stretch" spacing={1}>
          <Text fontSize="lg" fontWeight="600">Create a separate limited password</Text>
          <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
            Share this only with agents you trust. It cannot reveal private
            keys, but it can authorize transactions and messages.
          </Text>
        </VStack>
        <VStack spacing={4} align="stretch">
          <FormControl isInvalid={!!props.errors.agentPassword}>
            <FormLabel>Agent password</FormLabel>
            <InputGroup>
              <Input
                ref={props.passwordInputRef}
                type={props.showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                value={props.password}
                onChange={(event) => props.onPasswordChange(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && props.onSubmit()}
                pr="3rem"
                autoComplete="new-password"
              />
              <InputRightElement w="44px" h="44px">
                <IconButton
                  aria-label={props.showPassword ? "Hide password" : "Show password"}
                  icon={props.showPassword ? <ViewOffIcon /> : <ViewIcon />}
                  minW="40px"
                  h="40px"
                  variant="ghost"
                  onClick={props.onToggleVisibility}
                  color="fg.secondary"
                />
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage>{props.errors.agentPassword}</FormErrorMessage>
          </FormControl>
          <FormControl isInvalid={!!props.errors.confirmPassword}>
            <FormLabel>Confirm agent password</FormLabel>
            <Input
              type={props.showPassword ? "text" : "password"}
              placeholder="Enter it again"
              value={props.confirmPassword}
              onChange={(event) => props.onConfirmChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && props.onSubmit()}
              autoComplete="new-password"
            />
            <FormErrorMessage>{props.errors.confirmPassword}</FormErrorMessage>
          </FormControl>
        </VStack>
        <Text fontSize="sm" color="fg.muted" lineHeight="1.5">
          Store this password securely. It is required each time an agent
          unlocks the wallet.
        </Text>
      </VStack>
    </SettingsScreenFrame>
  );
}

interface RemoveViewProps {
  password: string;
  showPassword: boolean;
  error: string;
  submitting: boolean;
  passwordInputRef: RefObject<HTMLInputElement>;
  onPasswordChange: (value: string) => void;
  onToggleVisibility: () => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function RemoveAgentPasswordView(props: RemoveViewProps) {
  return (
    <SettingsScreenFrame
      title="Remove agent password"
      onBack={props.onBack}
      primaryAction={<Button variant="danger" onClick={props.onSubmit} isLoading={props.submitting}>Remove agent password</Button>}
      secondaryAction={<Button variant="secondary" onClick={props.onBack}>Cancel</Button>}
    >
      <VStack spacing={6} align="stretch">
        <VStack align="stretch" spacing={1}>
          <Text fontSize="lg" fontWeight="600">Confirm with your master password</Text>
          <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
            Trusted agents will no longer be able to unlock WalletChan after
            this password is removed.
          </Text>
        </VStack>
        <FormControl isInvalid={!!props.error}>
          <FormLabel>Master password</FormLabel>
          <InputGroup>
            <Input
              ref={props.passwordInputRef}
              type={props.showPassword ? "text" : "password"}
              placeholder="Enter master password"
              value={props.password}
              onChange={(event) => props.onPasswordChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && props.onSubmit()}
              pr="3rem"
              autoComplete="current-password"
            />
            <InputRightElement w="44px" h="44px">
              <IconButton
                aria-label={props.showPassword ? "Hide password" : "Show password"}
                icon={props.showPassword ? <ViewOffIcon /> : <ViewIcon />}
                minW="40px"
                h="40px"
                variant="ghost"
                onClick={props.onToggleVisibility}
                color="fg.secondary"
              />
            </InputRightElement>
          </InputGroup>
          <FormErrorMessage>{props.error}</FormErrorMessage>
        </FormControl>
        <HStack
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
            Only the master password will unlock the wallet afterward.
          </Text>
        </HStack>
      </VStack>
    </SettingsScreenFrame>
  );
}

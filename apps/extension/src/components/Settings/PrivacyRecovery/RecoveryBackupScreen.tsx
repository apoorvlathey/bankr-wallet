import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import {
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
import type { RefObject } from "react";

import { ScreenSection } from "@/components/ui";
import { RecoveryPhrasePanel } from "./RecoveryPhrasePanel";
import { ShieldBalanceSummary } from "./ShieldBalanceSummary";
import type { ShieldPortfolio } from "./types";

interface Props {
  replacement: boolean;
  password: string;
  showPassword: boolean;
  phrase: string;
  phraseVisible: boolean;
  copied: boolean;
  error: string;
  passwordRef: RefObject<HTMLInputElement>;
  portfolio: ShieldPortfolio | null;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onReveal: () => void;
  onTogglePhrase: () => void;
  onCopy: () => void;
}

export function RecoveryBackupScreen(props: Props) {
  return (
    <VStack spacing={5} align="stretch">
      <ScreenSection
        title="Back up your Shield phrase"
        description={props.replacement
          ? "Save the current phrase before replacing it. You may need it to recover the Shield balance below."
          : "Enter your main password to reveal the separate phrase used only for Shield."}
      >
        <VStack spacing={4} align="stretch">
          {props.replacement ? <ShieldBalanceSummary portfolio={props.portfolio} /> : null}
          {props.phrase ? (
            <RecoveryPhrasePanel
              phrase={props.phrase}
              visible={props.phraseVisible}
              copied={props.copied}
              onToggleVisibility={props.onTogglePhrase}
              onCopy={props.onCopy}
            />
          ) : (
            <FormControl isInvalid={!!props.error}>
              <FormLabel>Main password</FormLabel>
              <InputGroup>
                <Input
                  ref={props.passwordRef}
                  type={props.showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={props.password}
                  onChange={(event) => props.onPasswordChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") props.onReveal();
                  }}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={props.showPassword ? "Hide password" : "Show password"}
                    icon={props.showPassword ? <ViewOffIcon /> : <ViewIcon />}
                    size="sm"
                    variant="ghost"
                    color="fg.secondary"
                    onClick={props.onTogglePassword}
                  />
                </InputRightElement>
              </InputGroup>
              <FormErrorMessage>{props.error}</FormErrorMessage>
            </FormControl>
          )}
        </VStack>
      </ScreenSection>
      {props.phrase ? (
        <Text color="status.warning.emphasis" fontSize="sm" fontWeight="600">
          Keep this phrase offline. WalletChan cannot recover it for you.
        </Text>
      ) : null}
    </VStack>
  );
}

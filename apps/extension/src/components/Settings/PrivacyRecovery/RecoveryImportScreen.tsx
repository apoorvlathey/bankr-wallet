import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import {
  FormControl,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import type { RefObject } from "react";

import { ScreenSection } from "@/components/ui";

interface Props {
  replacing: boolean;
  phrase: string;
  password: string;
  showPassword: boolean;
  error: string;
  passwordRef: RefObject<HTMLInputElement>;
  onPhraseChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onRestore: () => void;
}

export function RecoveryImportScreen(props: Props) {
  return (
    <ScreenSection
      title="Restore Shield phrase"
      description={props.replacing
        ? "Enter the saved phrase that should replace the current Shield identity. The current phrase remains active until this succeeds."
        : "Enter a saved 12-word Shield phrase. WalletChan will encrypt it locally and scan Sepolia."}
    >
      <VStack spacing={4} align="stretch">
        <FormControl isInvalid={!!props.error}>
          <FormLabel>Shield recovery phrase</FormLabel>
          <Textarea
            value={props.phrase}
            onChange={(event) => props.onPhraseChange(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="12 words"
            minH="112px"
          />
        </FormControl>
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
                if (event.key === "Enter") props.onRestore();
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
        </FormControl>
      </VStack>
    </ScreenSection>
  );
}

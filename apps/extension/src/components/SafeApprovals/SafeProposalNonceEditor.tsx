import { CheckIcon, CloseIcon, EditIcon } from "@chakra-ui/icons";
import {
  FormControl,
  FormErrorMessage,
  HStack,
  IconButton,
  Input,
  Text,
} from "@chakra-ui/react";
import { useEffect, useId, useRef, useState } from "react";

function validateNonce(value: string, minimumNonce: `${bigint}`): string | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    return "Enter a whole-number nonce.";
  }
  const parsed = BigInt(value);
  if (parsed < BigInt(minimumNonce)) {
    return `Nonce must be ${minimumNonce} or higher.`;
  }
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    return "This nonce is too large.";
  }
  return null;
}

export function SafeProposalNonceEditor({
  nonce,
  minimumNonce,
  busy,
  editable,
  onNonceChange,
}: {
  nonce: number;
  minimumNonce: `${bigint}`;
  busy: boolean;
  editable: boolean;
  onNonceChange: (nonce: string) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [customNonce, setCustomNonce] = useState(String(nonce));
  const nonceError = editing ? validateNonce(customNonce, minimumNonce) : null;

  useEffect(() => {
    setEditing(false);
    setCustomNonce(String(nonce));
  }, [nonce]);

  const startEditing = () => {
    setCustomNonce(String(nonce));
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const cancelEditing = () => {
    setCustomNonce(String(nonce));
    setEditing(false);
  };

  const submitNonce = async () => {
    if (nonceError || busy) return;
    if (await onNonceChange(customNonce)) setEditing(false);
  };

  return (
    <HStack
      minH="52px"
      px={3}
      py={2}
      spacing={3}
      align={editing ? "flex-start" : "center"}
      justify="space-between"
    >
      <Text
        pt={editing ? 2.5 : 0}
        color="fg.secondary"
        fontSize="xs"
        fontWeight="600"
        flexShrink={0}
      >
        Safe nonce
      </Text>

      {editing ? (
        <FormControl isInvalid={!!nonceError} maxW="224px">
          <HStack spacing={0.5} justify="flex-end">
            <Input
              ref={inputRef}
              aria-label="Custom Safe nonce"
              aria-describedby={nonceError ? errorId : undefined}
              inputMode="numeric"
              pattern="[0-9]*"
              value={customNonce}
              minW={0}
              h="40px"
              px={2.5}
              fontFamily="mono"
              textAlign="right"
              onChange={(event) => setCustomNonce(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelEditing();
                if (event.key === "Enter" && !nonceError) {
                  event.preventDefault();
                  void submitNonce();
                }
              }}
            />
            <IconButton
              aria-label="Cancel Safe nonce edit"
              icon={<CloseIcon boxSize={2.5} />}
              variant="ghost"
              size="xs"
              minW="32px"
              w="32px"
              h="32px"
              p={0}
              color="fg.secondary"
              isDisabled={busy}
              onClick={cancelEditing}
            />
            <IconButton
              aria-label="Confirm Safe nonce"
              icon={<CheckIcon boxSize={3} />}
              variant="ghost"
              size="xs"
              minW="32px"
              w="32px"
              h="32px"
              p={0}
              color="status.success.emphasis"
              isLoading={busy}
              isDisabled={!!nonceError}
              onClick={() => void submitNonce()}
            />
          </HStack>
          {nonceError && (
            <FormErrorMessage
              id={errorId}
              mt={1.5}
              justifyContent="flex-end"
              color="status.error.emphasis"
              fontSize="xs"
              textAlign="right"
            >
              {nonceError}
            </FormErrorMessage>
          )}
        </FormControl>
      ) : (
        <HStack spacing={1} justify="flex-end">
          <Text fontFamily="mono" fontSize="xs">{nonce}</Text>
          {editable && (
            <IconButton
              aria-label="Edit Safe nonce"
              icon={<EditIcon boxSize={3.5} />}
              variant="ghost"
              size="sm"
              minW="40px"
              h="40px"
              color="fg.secondary"
              isDisabled={busy}
              onClick={startEditing}
            />
          )}
        </HStack>
      )}
    </HStack>
  );
}

import {
  Button,
  FormControl,
  HStack,
  Input,
  Spinner,
  Text,
} from "@chakra-ui/react";

interface TransactionNonceEditorProps {
  value: string;
  loading: boolean;
  error: string | null;
  isReadOnly?: boolean;
  onChange: (value: string) => void;
  onRetry: () => void;
}

export function TransactionNonceEditor({
  value,
  loading,
  error,
  isReadOnly = false,
  onChange,
  onRetry,
}: TransactionNonceEditorProps) {
  const canRetry = !loading && value.length === 0 && error;
  return (
    <FormControl isInvalid={!loading && !!error} px={3} py={2}>
      <HStack align="center" justify="space-between" spacing={3} minH="28px">
        <Text fontSize="xs" color="fg.secondary" fontWeight="600">
          Address nonce
        </Text>
        {loading ? (
          <HStack h="28px" w="76px" justify="flex-end" spacing={1.5} color="fg.secondary">
            <Spinner size="xs" />
            <Text fontSize="2xs">Loading</Text>
          </HStack>
        ) : (
          <Input
            aria-label="Address nonce"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
            h="28px"
            minH="28px"
            w="76px"
            px={2}
            textAlign="right"
            fontFamily="mono"
            fontSize="xs"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            isReadOnly={isReadOnly}
            bg={isReadOnly ? "surface.sunken" : undefined}
          />
        )}
      </HStack>
      {error && !loading && (
        <HStack justify="flex-end" mt={1.5} spacing={2}>
          <Text
            fontSize="2xs"
            color="status.error.emphasis"
            textAlign="right"
          >
            {error}
          </Text>
          {canRetry && (
            <Button
              size="xs"
              variant="ghost"
              onClick={onRetry}
              isDisabled={isReadOnly}
            >
              Retry
            </Button>
          )}
        </HStack>
      )}
    </FormControl>
  );
}

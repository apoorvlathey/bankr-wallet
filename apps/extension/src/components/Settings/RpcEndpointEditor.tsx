import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import {
  AddIcon,
  ArrowBackIcon,
  CheckIcon,
  CopyIcon,
  EditIcon,
} from "@chakra-ui/icons";
import { InlineDisclosure } from "@/components/ui";
import {
  MAX_RPC_ENDPOINT_NAME_LENGTH,
  normalizeRpcEndpointName,
  normalizeRpcUrl,
  type SavedRpcEndpoint,
} from "@/lib/chains";
import { ImpersonatedTransactionSetting } from "./ImpersonatedTransactionSetting";

type RpcEndpointEditorProps = {
  mode: "add" | "edit";
  endpoint?: SavedRpcEndpoint;
  existingEndpoints: SavedRpcEndpoint[];
  isLoading: boolean;
  onCancel: () => void;
  onSubmit: (endpoint: SavedRpcEndpoint) => void;
};

export function RpcEndpointEditor({
  mode,
  endpoint,
  existingEndpoints,
  isLoading,
  onCancel,
  onSubmit,
}: RpcEndpointEditorProps) {
  const [draftName, setDraftName] = useState(endpoint?.name ?? "");
  const [draftUrl, setDraftUrl] = useState(endpoint?.url ?? "");
  const [allowImpersonatedTransactions, setAllowImpersonatedTransactions] =
    useState(endpoint?.allowImpersonatedTransactions === true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = mode === "edit";

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copyUrl = async () => {
    if (!draftUrl.trim()) return;
    try {
      await navigator.clipboard.writeText(draftUrl);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access may be unavailable in restricted extension contexts.
    }
  };

  const submit = () => {
    const normalizedUrl = normalizeRpcUrl(draftUrl);
    if (!normalizedUrl) {
      setError("Enter an HTTP or HTTPS RPC URL without embedded credentials.");
      return;
    }
    const duplicate = existingEndpoints.some(
      (saved) => saved.url === normalizedUrl && saved.url !== endpoint?.url,
    );
    if (duplicate) {
      setError("This RPC URL is already saved.");
      return;
    }

    const normalizedName = normalizeRpcEndpointName(draftName);
    onSubmit({
      url: normalizedUrl,
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(allowImpersonatedTransactions
        ? { allowImpersonatedTransactions: true }
        : {}),
    });
  };

  return (
    <Box
      as="form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        submit();
      }}
      p={3.5}
      bg="surface.sunken"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
    >
      <HStack align="flex-start" spacing={2} mb={2.5}>
        <IconButton
          type="button"
          aria-label="Back to saved RPC endpoints"
          icon={<ArrowBackIcon />}
          variant="ghost"
          minW="40px"
          h="40px"
          flexShrink={0}
          onClick={onCancel}
        />
        <Box minW={0}>
          <Text color="fg.primary" fontSize="sm" fontWeight="600">
            {isEditing ? "Edit RPC endpoint" : "Add RPC endpoint"}
          </Text>
          {isEditing && (
            <Text mt={0.5} color="fg.muted" fontSize="xs">
              Update its label or complete URL.
            </Text>
          )}
        </Box>
      </HStack>

      <VStack align="stretch" spacing={2.5}>
        <FormControl>
          <FormLabel
            htmlFor="rpc-endpoint-name"
            mb={1.5}
            color="fg.secondary"
            fontSize="xs"
            fontWeight="500"
          >
            Endpoint name <Text as="span" color="fg.muted">(optional)</Text>
          </FormLabel>
          <Input
            id="rpc-endpoint-name"
            value={draftName}
            maxLength={MAX_RPC_ENDPOINT_NAME_LENGTH}
            placeholder="Primary Alchemy"
            onChange={(event) => setDraftName(event.target.value)}
            isDisabled={isLoading}
          />
        </FormControl>

        <FormControl isInvalid={!!error}>
          <HStack justify="space-between" align="flex-end" mb={0.5} spacing={2}>
            <FormLabel
              htmlFor="rpc-endpoint-url"
              m={0}
              color="fg.secondary"
              fontSize="xs"
              fontWeight="500"
            >
              RPC URL
            </FormLabel>
            <Tooltip label={copied ? "Copied" : "Copy RPC URL"} hasArrow>
              <Box
                as="button"
                type="button"
                aria-label={copied ? "RPC URL copied" : "Copy RPC URL"}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                minW="24px"
                minH="24px"
                w="24px"
                h="24px"
                p={0}
                bg="transparent"
                border={0}
                borderRadius="sm"
                color={copied ? "accent.highlight" : "fg.muted"}
                cursor="pointer"
                flexShrink={0}
                disabled={isLoading || !draftUrl.trim()}
                onClick={copyUrl}
                _hover={{ bg: "surface.raisedHover", color: "fg.primary" }}
                _focusVisible={{ outline: "none", boxShadow: "focus" }}
                _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                {copied ? (
                  <CheckIcon boxSize={3} />
                ) : (
                  <CopyIcon boxSize={3.5} />
                )}
              </Box>
            </Tooltip>
          </HStack>
          <Input
            id="rpc-endpoint-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            value={draftUrl}
            placeholder="https://rpc.example.com/path/to/endpoint"
            autoFocus
            fontFamily="mono"
            fontSize="sm"
            onChange={(event) => {
              setDraftUrl(event.target.value);
              setCopied(false);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
            }}
            isDisabled={isLoading}
          />
          <FormErrorMessage mt={1} fontSize="xs">
            {error}
          </FormErrorMessage>
        </FormControl>

        <InlineDisclosure
          label="For Devs"
          description="Impersonated account transactions"
          autoScrollOnOpen
        >
          <Box px={2}>
            <ImpersonatedTransactionSetting
              showSectionLabel={false}
              isChecked={allowImpersonatedTransactions}
              isDisabled={isLoading}
              onChange={setAllowImpersonatedTransactions}
            />
          </Box>
        </InlineDisclosure>

        <HStack w="full" spacing={2}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            flex={1}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="brand"
            size="sm"
            flex={1}
            leftIcon={isEditing ? <EditIcon /> : <AddIcon />}
            isDisabled={isLoading || !draftUrl.trim()}
          >
            {isEditing ? "Save endpoint" : "Add endpoint"}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}

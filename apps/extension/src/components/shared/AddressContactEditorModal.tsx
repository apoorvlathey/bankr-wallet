import { CheckIcon } from "@chakra-ui/icons";
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { isAddress } from "viem";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { isResolvableName, resolveNameToAddress } from "@/lib/ensUtils";
import { cacheIdentityNameHint } from "@/lib/ensIdentityCache";
import { truncateAddress } from "@/lib/addressUtils";

interface AddressContactEditorModalProps {
  address?: string;
  initialLabel?: string;
  isEditing?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function AddressContactEditorModal({
  address,
  initialLabel = "",
  isEditing: isEditingProp,
  isOpen,
  onClose,
}: AddressContactEditorModalProps) {
  const [addressValue, setAddressValue] = useState(address || "");
  const [label, setLabel] = useState(initialLabel);
  const [error, setError] = useState<{ field: "address" | "label" | "form"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const { createContact, updateContact } = useAddressContacts();
  const isEditing = isEditingProp ?? Boolean(initialLabel && address);
  const [resolution, setResolution] = useState<
    | { status: "idle" | "resolving"; address: null; error: null }
    | { status: "resolved"; address: string; error: null }
    | { status: "error"; address: null; error: string }
  >({ status: "idle", address: null, error: null });

  useEffect(() => {
    if (!isOpen) return;
    setAddressValue(address || "");
    setLabel(initialLabel);
    setError(null);
  }, [address, initialLabel, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const input = addressValue.trim();
    if (isAddress(input, { strict: false })) {
      setResolution({ status: "resolved", address: input, error: null });
      return;
    }
    if (!isResolvableName(input)) {
      setResolution({ status: "idle", address: null, error: null });
      return;
    }

    let cancelled = false;
    setResolution({ status: "resolving", address: null, error: null });
    const timer = window.setTimeout(async () => {
      try {
        const resolvedAddress = await resolveNameToAddress(input);
        if (cancelled) return;
        if (!resolvedAddress) {
          setResolution({ status: "error", address: null, error: "Couldn’t resolve this name" });
          return;
        }
        setResolution({ status: "resolved", address: resolvedAddress, error: null });
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setResolution({
          status: "error",
          address: null,
          error: /429|too many/iu.test(message)
            ? "Name service is rate limited. Try again shortly."
            : "Couldn’t resolve this name. Check your RPC settings.",
        });
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addressValue, isOpen]);

  const submit = async () => {
    if (isSaving) return;
    const trimmedAddress = addressValue.trim();
    const trimmedLabel = label.trim();
    if (!resolution.address || !isAddress(resolution.address, { strict: false })) {
      setError({
        field: "address",
        message: isResolvableName(trimmedAddress)
          ? resolution.error || "Wait for the name to resolve"
          : "Enter a valid EVM address or name",
      });
      return;
    }
    if (!trimmedLabel) {
      setError({ field: "label", message: "Enter a label for this contact" });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (!isEditing && isResolvableName(trimmedAddress)) {
        // Seed before the contact mutation broadcasts, so list enrichment can
        // skip reverse resolution on its very first render.
        await cacheIdentityNameHint(resolution.address, trimmedAddress).catch(() => {});
      }
      if (isEditing) await updateContact(resolution.address, trimmedLabel);
      else await createContact(resolution.address, trimmedLabel);
      onClose();
    } catch (cause) {
      setError({
        field: "form",
        message: cause instanceof Error ? cause.message : "Couldn’t save contact",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} initialFocusRef={address ? labelRef : addressRef} isCentered>
      <ModalOverlay />
      <ModalContent
        as="form"
        mx={4}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <ModalHeader>{isEditing ? "Edit contact" : "Add contact"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl isInvalid={error?.field === "address" || resolution.status === "error"}>
            <FormLabel>Address</FormLabel>
            <Input
              ref={addressRef}
              value={addressValue}
              onChange={(event) => {
                setAddressValue(event.target.value);
                setError(null);
              }}
              isReadOnly={Boolean(address)}
              fontFamily="mono"
              fontSize="sm"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…, ENS, Basename, .wei, .gwei, or .mega"
            />
            {isResolvableName(addressValue.trim()) && resolution.status === "resolving" && (
              <HStack mt={2} spacing={1.5} color="fg.secondary" aria-live="polite">
                <Spinner size="xs" />
                <Text fontSize="xs">Resolving name…</Text>
              </HStack>
            )}
            {isResolvableName(addressValue.trim()) && resolution.status === "resolved" && (
              <HStack mt={2} spacing={1.5} color="status.success.fg" aria-live="polite">
                <CheckIcon boxSize="10px" />
                <Text fontSize="xs" fontFamily="mono">{truncateAddress(resolution.address)}</Text>
              </HStack>
            )}
            {resolution.status === "error" && (
              <FormErrorMessage role="alert">{resolution.error}</FormErrorMessage>
            )}
            {error?.field === "address" && resolution.status !== "error" && (
              <FormErrorMessage role="alert">{error.message}</FormErrorMessage>
            )}
          </FormControl>
          <FormControl mt={4} isInvalid={error?.field === "label"}>
            <FormLabel>Label</FormLabel>
            <Input
              ref={labelRef}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setError(null);
              }}
              maxLength={64}
              placeholder="e.g. milady"
              autoComplete="off"
            />
            {error?.field === "label" && (
              <FormErrorMessage role="alert">{error.message}</FormErrorMessage>
            )}
          </FormControl>
          {error?.field === "form" && (
            <Text mt={3} fontSize="xs" color="status.error.emphasis" role="alert">
              {error.message}
            </Text>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="brand" isLoading={isSaving} isDisabled={resolution.status === "resolving"}>Save contact</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

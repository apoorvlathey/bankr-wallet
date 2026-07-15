import { useEffect } from "react";
import {
  Box,
  FormControl,
  FormLabel,
  Text,
  VStack,
} from "@chakra-ui/react";

import { UtcDateTimePicker } from "@/components/UtcDateTimePicker";
import {
  enabledApprovalRevocationMethods,
  hasPermit2ApprovalRevocationMethod,
} from "@/lib/erc7715ApprovalRevocation";
import {
  assertErc7715PermissionEditIsAllowed,
  getErc7715PermissionExpiry,
  withErc7715PermissionExpiry,
} from "@/lib/erc7715PermissionEditing";
import type { Erc7715PermissionEditableControlsProps } from "./types";

export function Erc7715ApprovalRevocationControls({
  permissionRequest,
  editedRequest,
  validationError,
  onEditedRequestChange,
  onValidationErrorChange,
}: Erc7715PermissionEditableControlsProps) {
  const canEdit = editedRequest.permission.isAdjustmentAllowed;
  const requestedExpiry = getErc7715PermissionExpiry(permissionRequest.request);
  const editedExpiry = getErc7715PermissionExpiry(editedRequest);
  const methods = enabledApprovalRevocationMethods(editedRequest.permission.data);
  const hasPermit2 = hasPermit2ApprovalRevocationMethod(
    editedRequest.permission.data,
  );

  useEffect(() => {
    try {
      assertErc7715PermissionEditIsAllowed(
        permissionRequest.request,
        editedRequest,
      );
      onValidationErrorChange(null);
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid permission edits",
      );
    }
  }, [editedRequest, onValidationErrorChange, permissionRequest.request]);

  const handleExpiryChange = (expiry: number) => {
    try {
      const next = withErc7715PermissionExpiry(editedRequest, expiry);
      assertErc7715PermissionEditIsAllowed(permissionRequest.request, next);
      onValidationErrorChange(null);
      onEditedRequestChange(next);
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid expiration date",
      );
    }
  };

  return (
    <VStack align="stretch" spacing={3}>
      <VStack align="stretch" spacing={2}>
        <Text fontSize="xs" color="fg.secondary" fontWeight="600">
          Revocation methods
        </Text>
        <Box
          bg="surface.raised"
          borderWidth="1px"
          borderStyle="solid"
          borderColor="border.default"
          borderRadius="lg"
          overflow="hidden"
        >
          {methods.map((method, index) => (
            <VStack
              key={method.field}
              align="stretch"
              spacing={0.5}
              px={3}
              py={2.5}
              borderBottomWidth={index + 1 === methods.length ? 0 : "1px"}
              borderBottomStyle="solid"
              borderBottomColor="border.subtle"
            >
              <Text fontSize="sm" color="fg.primary" fontWeight="600">
                {method.label}
              </Text>
              <Text fontSize="xs" color="fg.secondary">
                {method.description}
              </Text>
            </VStack>
          ))}
        </Box>
      </VStack>

      {hasPermit2 && (
        <Box
          bg="status.warning.bg"
          borderWidth="1px"
          borderStyle="solid"
          borderColor="status.warning.border"
          borderRadius="md"
          p={3}
        >
          <Text fontSize="xs" color="status.warning.fg" fontWeight="600">
            Permit2 revocation methods target canonical Permit2. If nonce
            invalidation is enabled, the delegate can cancel pending Permit2
            signatures for any token and spender pair.
          </Text>
        </Box>
      )}

      <FormControl>
        <FormLabel fontSize="xs" fontWeight="600" color="fg.secondary">
          Expiration date (UTC)
        </FormLabel>
        <UtcDateTimePicker
          valueSeconds={editedExpiry ?? Math.floor(Date.now() / 1000) + 3600}
          disabled={!canEdit}
          dateBoundaries={
            requestedExpiry === null
              ? []
              : [
                  {
                    seconds: requestedExpiry,
                    direction: "maximum",
                    label: "Requested expiry (maximum)",
                  },
                ]
          }
          error={validationError}
          label="Expiration date"
          onChange={handleExpiryChange}
        />
      </FormControl>
    </VStack>
  );
}

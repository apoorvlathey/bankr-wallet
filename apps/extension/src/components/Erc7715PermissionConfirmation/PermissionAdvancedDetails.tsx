import { Code, HStack, Text, VStack } from "@chakra-ui/react";

import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import { CopyButton } from "@/components/CopyButton";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListSurface,
} from "@/components/ui";
import { shortAddress } from "@/lib/erc7715PermissionDisplay";

const DELEGATION_MANAGER = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";

export function PermissionAdvancedDetails({
  permissionType,
  caveats,
  rawRequest,
  explorer,
}: {
  permissionType: string;
  caveats: PendingErc7715PermissionRequest["caveats"];
  rawRequest: string;
  explorer?: string;
}) {
  return (
    <VStack align="stretch" spacing={4}>
      <ListSurface aria-label="Technical permission metadata">
        <ListItem density="compact">
          <ListItemContent>
            <ListItemDescription>Request type</ListItemDescription>
          </ListItemContent>
          <ListItemActions minW={0}>
            <Code
              color="fg.primary"
              bg="surface.sunken"
              fontFamily="mono"
              fontSize="xs"
              whiteSpace="normal"
              overflowWrap="anywhere"
            >
              {permissionType}
            </Code>
          </ListItemActions>
        </ListItem>
        <ListItem density="compact">
          <ListItemContent>
            <ListItemDescription>Delegation manager</ListItemDescription>
          </ListItemContent>
          <ListItemActions>
            <LabeledAddressPopover
              address={DELEGATION_MANAGER}
              contextLabel="delegation manager"
              explorer={explorer}
              label={shortAddress(DELEGATION_MANAGER)}
            />
          </ListItemActions>
        </ListItem>
      </ListSurface>

      <VStack align="stretch" spacing={2}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          Signing caveats ({caveats.length})
        </Text>
        <ListSurface aria-label="Signing caveats">
          {caveats.map((caveat, index) => (
            <ListItem key={`${caveat.enforcer}-${index}`} density="compact">
              <ListItemContent minW={0}>
                <Text color="fg.primary" fontSize="sm" fontWeight="600">
                  {caveat.enforcerName}
                </Text>
                <HStack spacing={1} minW={0}>
                  <Code
                    color="fg.secondary"
                    bg="transparent"
                    fontFamily="mono"
                    fontSize="2xs"
                    noOfLines={1}
                    minW={0}
                  >
                    {caveat.terms}
                  </Code>
                  <CopyButton value={caveat.terms} label={`Copy ${caveat.enforcerName} terms`} />
                </HStack>
              </ListItemContent>
              <ListItemActions>
                <LabeledAddressPopover
                  address={caveat.enforcer}
                  contextLabel={`${caveat.enforcerName} enforcer`}
                  explorer={explorer}
                  label={shortAddress(caveat.enforcer)}
                />
              </ListItemActions>
            </ListItem>
          ))}
        </ListSurface>
      </VStack>

      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between">
          <Text color="fg.secondary" fontSize="xs" fontWeight="600">
            Raw permission request
          </Text>
          <CopyButton value={rawRequest} label="Copy raw permission request" />
        </HStack>
        <Code
          as="pre"
          m={0}
          p={3}
          maxH="240px"
          overflow="auto"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
          bg="surface.raised"
          borderWidth="1px"
          borderStyle="solid"
          borderColor="border.subtle"
          borderRadius="lg"
          color="fg.secondary"
          fontFamily="mono"
          fontSize="xs"
        >
          {rawRequest}
        </Code>
      </VStack>
    </VStack>
  );
}

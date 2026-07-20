import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { formatEther } from "viem";

import type { ReturnTypeUseUnshield } from "./hooks/useUnshield.types";
import { formatShieldWei } from "./model/shieldQuote";

interface Props {
  availableWei: bigint;
  controller: ReturnTypeUseUnshield;
}

export default function UnshieldAmountPanel({ availableWei, controller }: Props) {
  const operation = controller.state.operation;
  const busy = controller.state.status === "quoting" || controller.state.status === "proving";
  return (
    <Box bg="surface.raised" border="1px solid" borderColor="border.default" borderRadius="lg" p={4}>
      <VStack align="stretch" spacing={4}>
        <Text fontWeight="700">Unshield ETH</Text>
        <FormControl>
          <FormLabel fontSize="xs" color="fg.secondary">Amount</FormLabel>
          <HStack>
            <Input
              value={controller.amount}
              onChange={(event) => controller.setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.0"
              aria-label="ETH amount to Unshield"
            />
            <Button size="sm" variant="secondary" onClick={() => controller.setAmount(formatEther(availableWei))}>
              Max
            </Button>
          </HStack>
          <Text mt={1} fontSize="xs" color="fg.secondary">
            Available {formatShieldWei(availableWei)} ETH
          </Text>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="xs" color="fg.secondary">Recipient</FormLabel>
          <Input
            value={controller.recipient}
            onChange={(event) => controller.setRecipient(event.target.value)}
            placeholder="0x…"
            aria-label="Unshield recipient address"
          />
        </FormControl>

        {operation ? (
          <VStack align="stretch" spacing={1} fontSize="sm">
            <HStack justify="space-between">
              <Text color="fg.secondary">Recipient gets</Text>
              <Text fontWeight="600">{formatShieldWei(operation.netRecipientAmountWei)} ETH</Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="fg.secondary">Relay fee</Text>
              <Text>{formatShieldWei(operation.relayFeeWei)} ETH</Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="fg.secondary">Relay</Text>
              <Text>{operation.relayerName}</Text>
            </HStack>
          </VStack>
        ) : null}

        {operation?.recipientMatchesDepositor ? (
          <Alert status="warning" borderRadius="md" py={2}>
            <AlertIcon />
            <Text fontSize="xs">Using the original address can weaken privacy.</Text>
          </Alert>
        ) : null}
        {controller.state.status === "error" ? (
          <Text role="alert" fontSize="xs" color="status.error.fg">{controller.state.error}</Text>
        ) : null}
        {controller.state.status === "submitted" ? (
          <Text role="status" fontSize="xs" color="status.success.fg">Submitted on Sepolia. Balance will update after confirmation.</Text>
        ) : null}

        {controller.state.status === "quoted" || controller.state.status === "proving" ? (
          <Button
            variant="brand"
            isLoading={controller.state.status === "proving"}
            loadingText="Preparing"
            onClick={() => void controller.execute()}
          >
            Unshield
          </Button>
        ) : controller.state.status !== "submitted" ? (
          <Button
            variant="brand"
            isLoading={controller.state.status === "quoting"}
            loadingText="Getting quote"
            isDisabled={!controller.validation.valid || busy || availableWei === 0n}
            onClick={() => void controller.quote()}
          >
            Get quote
          </Button>
        ) : null}
      </VStack>
    </Box>
  );
}

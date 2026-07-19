import { Box, FormControl, FormLabel, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { InlineDisclosure } from "@/components/ui";
import { ImpersonatedTransactionSetting } from "./ImpersonatedTransactionSetting";

interface AddChainAdvancedDetailsProps {
  explorer: string;
  currencySymbol: string;
  currencyDecimals: string;
  allowImpersonatedTransactions: boolean;
  onExplorerChange: (value: string) => void;
  onCurrencySymbolChange: (value: string) => void;
  onCurrencyDecimalsChange: (value: string) => void;
  onAllowImpersonatedTransactionsChange: (enabled: boolean) => void;
}

export function AddChainAdvancedDetails({
  explorer,
  currencySymbol,
  currencyDecimals,
  allowImpersonatedTransactions,
  onExplorerChange,
  onCurrencySymbolChange,
  onCurrencyDecimalsChange,
  onAllowImpersonatedTransactionsChange,
}: AddChainAdvancedDetailsProps) {
  return (
    <VStack spacing={4} align="stretch" pt={2}>
      <FormControl>
        <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
          Block explorer URL
        </FormLabel>
        <Input
          placeholder="https://explorer.example.com"
          value={explorer}
          onChange={(event) => onExplorerChange(event.target.value.trim())}
        />
        <Text mt={1} color="fg.secondary" fontSize="xs">
          Optional. Used for transaction and address links.
        </Text>
      </FormControl>

      <HStack spacing={3} align="flex-start">
        <FormControl flex={2}>
          <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
            Native token symbol
          </FormLabel>
          <Input
            placeholder="ETH"
            value={currencySymbol}
            onChange={(event) => onCurrencySymbolChange(event.target.value.trim())}
          />
        </FormControl>
        <FormControl flex={1}>
          <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
            Decimals
          </FormLabel>
          <Input
            type="number"
            value={currencyDecimals}
            onChange={(event) => onCurrencyDecimalsChange(event.target.value)}
          />
        </FormControl>
      </HStack>

      <InlineDisclosure
        label="For Devs"
        description="Impersonated account transactions"
        autoScrollOnOpen
      >
        <Box px={2}>
          <ImpersonatedTransactionSetting
            showSectionLabel={false}
            isChecked={allowImpersonatedTransactions}
            onChange={onAllowImpersonatedTransactionsChange}
          />
        </Box>
      </InlineDisclosure>
    </VStack>
  );
}

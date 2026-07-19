import { Box, Radio, RadioGroup, Text, VStack } from "@chakra-ui/react";
import { ScreenSection } from "@/components/ui";

export type LedgerDerivationScheme = "ledgerLive" | "bip44" | "legacyMew";

const OPTIONS: Array<{
  value: LedgerDerivationScheme;
  label: string;
  path: string;
}> = [
  { value: "ledgerLive", label: "Ledger Wallet", path: "m/44'/60'/n'/0/0" },
  { value: "bip44", label: "BIP-44", path: "m/44'/60'/0'/0/n" },
  { value: "legacyMew", label: "Legacy MEW", path: "m/44'/60'/0'/n" },
];

export function LedgerDerivationPicker({
  value,
  onChange,
}: {
  value: LedgerDerivationScheme;
  onChange(value: LedgerDerivationScheme): void;
}) {
  return (
    <ScreenSection
      title="Derivation path"
      description="Choose the layout used when the accounts were created."
    >
      <RadioGroup value={value} onChange={onChange}>
        <VStack align="stretch" spacing={2}>
          {OPTIONS.map((option) => (
            <Radio key={option.value} value={option.value} py={1.5}>
              <Box ml={1}>
                <Text color="fg.primary" fontWeight="600">
                  {option.label}
                </Text>
                <Text
                  mt={0.5}
                  color="fg.secondary"
                  fontFamily="mono"
                  fontSize="sm"
                >
                  {option.path}
                </Text>
              </Box>
            </Radio>
          ))}
        </VStack>
      </RadioGroup>
    </ScreenSection>
  );
}

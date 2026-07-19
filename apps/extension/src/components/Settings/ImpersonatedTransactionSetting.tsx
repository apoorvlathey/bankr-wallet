import { Checkbox, Text, VStack } from "@chakra-ui/react";

export function ImpersonatedTransactionSetting({
  isChecked,
  isDisabled = false,
  showSectionLabel = true,
  onChange,
}: {
  isChecked: boolean;
  isDisabled?: boolean;
  showSectionLabel?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <Checkbox
      w="full"
      minH="48px"
      alignItems="center"
      justifyContent="space-between"
      flexDirection="row-reverse"
      gap={3}
      flexShrink={0}
      isChecked={isChecked}
      isDisabled={isDisabled}
      variant="commitment"
      onChange={(event) => onChange(event.target.checked)}
      sx={{
        "& .chakra-checkbox__label": {
          flex: "1 1 auto",
          minWidth: 0,
          marginInlineStart: 0,
          textAlign: "left",
        },
      }}
    >
      <VStack w="full" align="start" spacing={0.5} minW={0} textAlign="left">
        {showSectionLabel && (
          <Text color="fg.muted" fontSize="xs" fontWeight="600">
            For Devs
          </Text>
        )}
        <Text color="fg.primary" fontSize="sm" fontWeight="500">
          This RPC allows sending txs from impersonated accounts
        </Text>
      </VStack>
    </Checkbox>
  );
}

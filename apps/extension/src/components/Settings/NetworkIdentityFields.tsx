import {
  Box,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  Tooltip,
} from "@chakra-ui/react";

type NetworkIdentityFieldsProps = {
  isCustom: boolean;
  networkName: string;
  chainId: string;
  chainIdHex: string;
  isNetworkNameNotUnique: boolean;
  onNetworkNameChange: (value: string) => void;
  onChainIdChange: (value: string) => void;
};

export function NetworkIdentityFields({
  isCustom,
  networkName,
  chainId,
  chainIdHex,
  isNetworkNameNotUnique,
  onNetworkNameChange,
  onChainIdChange,
}: NetworkIdentityFieldsProps) {
  return (
    <>
      <FormControl isInvalid={isNetworkNameNotUnique}>
        <FormLabel
          htmlFor="edit-network-name"
          mb={1.5}
          color="fg.secondary"
          fontSize="sm"
          fontWeight="500"
        >
          Network name
        </FormLabel>
        <Tooltip
          label="Built-in network names cannot be changed."
          isDisabled={isCustom}
          placement="top"
          hasArrow
        >
          <Box>
            <Input
              id="edit-network-name"
              placeholder="Network name"
              value={networkName}
              onChange={(event) => onNetworkNameChange(event.target.value)}
              isReadOnly={!isCustom}
              bg={!isCustom ? "surface.sunken" : undefined}
              color={!isCustom ? "fg.muted" : undefined}
              cursor={!isCustom ? "not-allowed" : undefined}
            />
          </Box>
        </Tooltip>
        {isNetworkNameNotUnique && (
          <Text mt={1} color="chart.negative" fontSize="xs" fontWeight="600">
            Chain name already exists
          </Text>
        )}
      </FormControl>

      <FormControl>
        <FormLabel
          htmlFor="edit-network-chain-id"
          mb={1.5}
          color="fg.secondary"
          fontSize="sm"
          fontWeight="500"
        >
          Chain ID
        </FormLabel>
        <Tooltip
          label="Chain ID cannot be changed."
          isDisabled={isCustom}
          placement="top"
          hasArrow
        >
          <Box>
            <InputGroup>
              <Input
                id="edit-network-chain-id"
                placeholder="Chain ID"
                value={chainId}
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(event) => {
                  if (isCustom) onChainIdChange(event.target.value);
                }}
                isReadOnly={!isCustom}
                bg={!isCustom ? "surface.sunken" : undefined}
                color={!isCustom ? "fg.muted" : undefined}
                cursor={!isCustom ? "not-allowed" : undefined}
                pr={chainIdHex ? "5.75rem" : undefined}
              />
              {chainIdHex && (
                <InputRightElement width="5.5rem" pointerEvents="none">
                  <Text color="fg.muted" fontFamily="mono" fontSize="xs">
                    {chainIdHex}
                  </Text>
                </InputRightElement>
              )}
            </InputGroup>
          </Box>
        </Tooltip>
      </FormControl>
    </>
  );
}

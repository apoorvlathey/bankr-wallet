import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Input,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { useId } from "react";
import { MaxFeeField } from "./MaxFeeField";

function EditableGasField({
  label,
  value,
  onChange,
  suffix,
  isInvalid,
  isReadOnly = false,
  readOnlyHint,
  inputMode = "decimal",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  isInvalid: boolean;
  isReadOnly?: boolean;
  readOnlyHint?: string;
  inputMode?: "decimal" | "numeric";
}) {
  const inputId = useId();
  const input = (
    <Input
      id={inputId}
      size="xs"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode={inputMode}
      autoComplete="off"
      spellCheck={false}
      w="full"
      textAlign="right"
      fontFamily="mono"
      fontWeight="700"
      fontSize="sm"
      isInvalid={isInvalid}
      isReadOnly={isReadOnly}
      px={3}
      h="40px"
      minH="40px"
      bg={isReadOnly ? "surface.sunken" : undefined}
      cursor={readOnlyHint ? "help" : undefined}
      sx={{ fontVariantNumeric: "tabular-nums" }}
    />
  );

  return (
    <FormControl isInvalid={isInvalid} minW={0}>
      <HStack justify="space-between" spacing={1} minW={0} minH="18px">
        <FormLabel
          htmlFor={inputId}
          m={0}
          fontSize="2xs"
          color="text.tertiary"
          fontWeight="600"
          lineHeight="short"
          noOfLines={1}
        >
          {label}
        </FormLabel>
        {suffix && (
          <Text
            fontSize="9px"
            lineHeight="shorter"
            color="text.tertiary"
            fontWeight="600"
            flexShrink={0}
            mr={2}
          >
            {suffix}
          </Text>
        )}
      </HStack>
      {readOnlyHint ? (
        <Tooltip
          label={readOnlyHint}
          fontSize="2xs"
          hasArrow
          openDelay={300}
          placement="top"
        >
          {input}
        </Tooltip>
      ) : (
        input
      )}
    </FormControl>
  );
}

interface CustomGasEditorProps {
  gasLimit: string;
  priorityFee: string;
  maxFee: string;
  baseFee: string;
  fiatCost: string | null;
  nativeCost: string;
  gasLimitValid: boolean;
  priorityFeeValid: boolean;
  maxFeeValid: boolean;
  allFieldsValid: boolean;
  maxFeeCoversBase: boolean;
  maxFeeManual: boolean;
  showActions: boolean;
  canSet: boolean;
  onGasLimitChange: (value: string) => void;
  onPriorityFeeChange: (value: string) => void;
  onMaxFeeChange: (value: string) => void;
  onEnableMaxFeeEdit: () => void;
  onRelinkMaxFee: () => void;
  onCancel: () => void;
  onSet: () => void;
}

/** Focused second step for reviewing and committing custom gas parameters. */
export function CustomGasEditor({
  gasLimit,
  priorityFee,
  maxFee,
  baseFee,
  fiatCost,
  nativeCost,
  gasLimitValid,
  priorityFeeValid,
  maxFeeValid,
  allFieldsValid,
  maxFeeCoversBase,
  maxFeeManual,
  showActions,
  canSet,
  onGasLimitChange,
  onPriorityFeeChange,
  onMaxFeeChange,
  onEnableMaxFeeEdit,
  onRelinkMaxFee,
  onCancel,
  onSet,
}: CustomGasEditorProps) {
  return (
    <VStack align="stretch" spacing={2.5}>
      <EditableGasField
        label="Gas limit"
        value={gasLimit}
        onChange={onGasLimitChange}
        isInvalid={!gasLimitValid}
        inputMode="numeric"
      />

      <Grid
        templateColumns="minmax(0, 1fr) 14px minmax(0, 1fr)"
        columnGap={2}
        alignItems="start"
      >
        <EditableGasField
          label="Priority fee"
          value={priorityFee}
          onChange={onPriorityFeeChange}
          suffix="Gwei"
          isInvalid={!priorityFeeValid}
        />
        {maxFeeManual ? (
          <Box />
        ) : (
          <Text
            pt="20px"
            textAlign="center"
            fontSize="xs"
            fontWeight="700"
            color="text.tertiary"
            lineHeight="40px"
            aria-hidden
          >
            +
          </Text>
        )}
        <EditableGasField
          label="Base fee"
          value={baseFee}
          onChange={() => undefined}
          suffix="Gwei"
          isInvalid={false}
          isReadOnly
          readOnlyHint="Base fee is determined by the network and updates automatically."
        />
      </Grid>

      <MaxFeeField
        value={maxFee}
        onChange={onMaxFeeChange}
        isInvalid={!maxFeeValid}
        isManual={maxFeeManual}
        onEnableEdit={onEnableMaxFeeEdit}
        onRelink={onRelinkMaxFee}
      />

      <Box h="1px" bg="border.subtle" />
      <HStack justify="space-between" align="center" spacing={3}>
        <Text fontSize="xs" color="text.secondary" fontWeight="600">
          Estimated max
        </Text>
        <VStack align="flex-end" spacing={0} minW={0}>
          <Text fontSize="xs" color="text.primary" fontWeight="700" noOfLines={1}>
            {fiatCost || nativeCost}
          </Text>
          {fiatCost && (
            <Text fontSize="2xs" color="text.tertiary" fontFamily="mono" noOfLines={1}>
              {nativeCost}
            </Text>
          )}
        </VStack>
      </HStack>

      {allFieldsValid && !maxFeeCoversBase && (
        <Text fontSize="2xs" color="status.error.emphasis" fontWeight="700">
          Max Fee must be at least Base Fee + Priority Fee
        </Text>
      )}
      {!allFieldsValid && (
        <Text fontSize="2xs" color="status.error.emphasis" fontWeight="700">
          Invalid gas parameters
        </Text>
      )}

      {showActions && (
        <HStack spacing={2} pt={0.5}>
          <Button
            size="xs"
            variant="secondary"
            flex={1}
            h="32px"
            minH="32px"
            fontSize="xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            variant="brand"
            flex={1}
            h="32px"
            minH="32px"
            fontSize="xs"
            isDisabled={!canSet}
            onClick={onSet}
          >
            Set
          </Button>
        </HStack>
      )}
    </VStack>
  );
}

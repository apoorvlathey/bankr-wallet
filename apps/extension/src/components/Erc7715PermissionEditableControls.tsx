import { useEffect, useState } from "react";
import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  Select,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { formatUnits, parseUnits } from "viem";

import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import { Erc7715PermissionTokenCard } from "@/components/Erc7715PermissionTokenCard";
import { UtcDateTimePicker } from "@/components/UtcDateTimePicker";
import { useErc7715PermissionAsset } from "@/components/useErc7715PermissionAsset";
import { formatUsd } from "@/lib/currencyFormatUtils";
import {
  enabledApprovalRevocationMethods,
  hasPermit2ApprovalRevocationMethod,
} from "@/lib/erc7715ApprovalRevocation";
import {
  assertErc7715PermissionEditIsAllowed,
  ERC7715_MAX_UINT256_HEX,
  getErc7715PermissionAmount,
  getErc7715PermissionAmountPerSecond,
  getErc7715PermissionExpiry,
  getErc7715PermissionInitialAmount,
  getErc7715PermissionMaxAmount,
  getErc7715PermissionPeriodDuration,
  getErc7715PermissionStartTime,
  getErc7715PermissionTokenAddress,
  isErc7715StreamPermissionType,
  isErc7715UnlimitedMaxAmount,
  isErc7715NativePermissionType,
  isErc7715PeriodicPermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
  withErc7715PermissionAmountPerSecond,
  withErc7715PermissionAmount,
  withErc7715PermissionExpiry,
  withErc7715PermissionInitialAmount,
  withErc7715PermissionMaxAmount,
  withErc7715PermissionPeriodDuration,
  withErc7715PermissionStartTime,
} from "@/lib/erc7715PermissionEditing";
import { useTheme } from "@/theme";

const DAY_SECONDS = 24 * 60 * 60;

const FREQUENCY_OPTIONS = [
  { label: "Hourly", seconds: 60 * 60 },
  { label: "Daily", seconds: 24 * 60 * 60 },
  { label: "Weekly", seconds: 7 * 24 * 60 * 60 },
  { label: "Biweekly", seconds: 14 * 24 * 60 * 60 },
  { label: "Monthly", seconds: 30 * 24 * 60 * 60 },
  { label: "Yearly", seconds: 365 * 24 * 60 * 60 },
] as const;

function frequencyLabel(seconds: number): string {
  const known = FREQUENCY_OPTIONS.find((option) => option.seconds === seconds);
  if (known) return known.label;
  return `Custom (${seconds}s)`;
}

function frequencyPeriodLabel(seconds: number | null): string {
  switch (seconds) {
    case 60 * 60:
      return "hour";
    case 24 * 60 * 60:
      return "day";
    case 7 * 24 * 60 * 60:
      return "week";
    case 14 * 24 * 60 * 60:
      return "2 weeks";
    case 30 * 24 * 60 * 60:
      return "month";
    case 365 * 24 * 60 * 60:
      return "year";
    default:
      return "period";
  }
}

function amountFieldLabel(
  permissionType: string,
  periodDuration: number | null,
): string {
  if (isErc7715StreamPermissionType(permissionType)) {
    return "Stream rate per second";
  }
  if (!isErc7715PeriodicPermissionType(permissionType)) return "Amount";
  return `Amount per ${frequencyPeriodLabel(periodDuration)}`;
}

function formatAmountForInput(
  request: Erc7715PermissionRequest,
  decimals: number,
): string {
  try {
    return formatUnits(getErc7715PermissionAmount(request), decimals);
  } catch {
    return "";
  }
}

function formatAmountUsdEstimate(amountInput: string, priceUsd: number): string {
  const trimmed = amountInput.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return "";
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0 || priceUsd <= 0) return "";
  return `~${formatUsd(amount * priceUsd)}`;
}

function compactDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/u, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function formatTokenAmount(
  rawAmount: bigint,
  decimals: number,
  symbol: string,
): string {
  return `${compactDecimal(formatUnits(rawAmount, decimals))} ${symbol}`;
}

function formatStreamUsdEstimate(
  amountInput: string,
  priceUsd: number,
): string {
  const trimmed = amountInput.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(trimmed)) return "";
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0 || priceUsd <= 0) return "";
  return `~${formatUsd(amount * DAY_SECONDS * priceUsd)}/day`;
}

function computeStreamTotalExposure({
  initialAmount,
  maxAmount,
  amountPerSecond,
  startTime,
  expiry,
}: {
  initialAmount: bigint;
  maxAmount: bigint;
  amountPerSecond: bigint;
  startTime: number;
  expiry: number | null;
}): bigint | null {
  const exposureAtExpiry =
    expiry === null
      ? null
      : initialAmount +
        amountPerSecond * BigInt(Math.max(0, expiry - startTime));

  if (exposureAtExpiry !== null) {
    return isErc7715UnlimitedMaxAmount(maxAmount)
      ? exposureAtExpiry
      : exposureAtExpiry < maxAmount
        ? exposureAtExpiry
        : maxAmount;
  }

  return isErc7715UnlimitedMaxAmount(maxAmount) ? null : maxAmount;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" spacing={3}>
      <Text fontSize="xs" color="text.secondary" fontWeight="900">
        {label}
      </Text>
      <Text fontSize="xs" color="text.primary" fontWeight="900" textAlign="right">
        {value}
      </Text>
    </HStack>
  );
}

type Erc7715PermissionEditableControlsProps = {
  permissionRequest: PendingErc7715PermissionRequest;
  editedRequest: Erc7715PermissionRequest;
  explorer?: string;
  nativeSymbol: string;
  onEditedRequestChange: (request: Erc7715PermissionRequest) => void;
  onValidationErrorChange: (error: string | null) => void;
};

function Erc7715ApprovalRevocationControls({
  permissionRequest,
  editedRequest,
  onEditedRequestChange,
  onValidationErrorChange,
}: Erc7715PermissionEditableControlsProps) {
  const { tokens } = useTheme();
  const canEdit = editedRequest.permission.isAdjustmentAllowed;
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
      <Box
        bg="surface.raised"
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius={tokens.radii.input}
        p={3}
      >
        <VStack align="stretch" spacing={2}>
          <Text fontSize="xs" color="text.secondary" fontWeight="900">
            Revocation methods
          </Text>
          {methods.map((method) => (
            <Box
              key={method.field}
              bg="surface.sunken"
              border={tokens.borders.thin}
              borderColor="border.subtle"
              borderRadius={tokens.radii.input}
              p={2.5}
            >
              <VStack align="stretch" spacing={0.5}>
                <Text fontSize="xs" color="text.primary" fontWeight="900">
                  {method.label}
                </Text>
                <Text fontSize="2xs" color="text.secondary" fontWeight="700">
                  {method.description}
                </Text>
              </VStack>
            </Box>
          ))}
        </VStack>
      </Box>

      {hasPermit2 && (
        <Box
          bg="status.warning.tint"
          border={tokens.borders.thin}
          borderColor="status.warning.border"
          borderRadius={tokens.radii.input}
          p={3}
        >
          <Text fontSize="xs" color="status.warning.fg" fontWeight="800">
            Permit2 revocation methods target canonical Permit2. If nonce
            invalidation is enabled, the delegate can cancel pending Permit2
            signatures for any token and spender pair.
          </Text>
        </Box>
      )}

      <FormControl>
        <FormLabel fontSize="xs" fontWeight="900" color="text.secondary">
          Expiration date (UTC)
        </FormLabel>
        <UtcDateTimePicker
          valueSeconds={editedExpiry ?? Math.floor(Date.now() / 1000) + 3600}
          disabled={!canEdit}
          label="Expiration date"
          onChange={handleExpiryChange}
        />
      </FormControl>
    </VStack>
  );
}

function Erc7715TokenPermissionEditableControls({
  permissionRequest,
  editedRequest,
  explorer,
  nativeSymbol,
  onEditedRequestChange,
  onValidationErrorChange,
}: Erc7715PermissionEditableControlsProps) {
  const { tokens } = useTheme();
  const tokenAddress = getErc7715PermissionTokenAddress(editedRequest);
  const [amountInput, setAmountInput] = useState("");
  const [initialInput, setInitialInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [amountDirty, setAmountDirty] = useState(false);
  const originalExpiry = getErc7715PermissionExpiry(permissionRequest.request);
  const editedStart = getErc7715PermissionStartTime(editedRequest);
  const editedExpiry = getErc7715PermissionExpiry(editedRequest);
  const editedPeriodDuration =
    getErc7715PermissionPeriodDuration(editedRequest);
  const isNative = isErc7715NativePermissionType(
    permissionRequest.permissionType,
  );
  const isPeriodic = isErc7715PeriodicPermissionType(
    permissionRequest.permissionType,
  );
  const isStream = isErc7715StreamPermissionType(
    permissionRequest.permissionType,
  );
  const canEditTerms = editedRequest.permission.isAdjustmentAllowed;
  const canEditExpiry = canEditTerms || !isStream;
  const asset = useErc7715PermissionAsset({
    permissionRequest,
    editedRequest,
    explorer,
    nativeSymbol,
    tokenAddress,
    isNative,
  });
  const hasVerifiedDecimals = typeof asset.decimals === "number";
  const decimals = asset.decimals ?? 18;
  const metadataError =
    asset.decimalsStatus === "loading"
      ? "Verifying token metadata before signing"
      : asset.decimalsStatus === "unverified"
        ? "Token decimals could not be verified. This permission cannot be signed safely."
        : null;
  const isAmountInputDisabled = !canEditTerms || !hasVerifiedDecimals;
  const amountUsdEstimate = formatAmountUsdEstimate(
    amountInput,
    asset.priceUsd,
  );
  const streamUsdEstimate = formatStreamUsdEstimate(
    amountInput,
    asset.priceUsd,
  );
  const selectedFrequency = editedPeriodDuration?.toString() || "";
  const hasCustomFrequency =
    editedPeriodDuration !== null &&
    !FREQUENCY_OPTIONS.some(
      (option) => option.seconds === editedPeriodDuration,
    );
  const amountLabelColor = tokens.colorMode === "dark" ? "fg.primary" : "text.primary";
  const amountEstimateColor =
    tokens.colorMode === "dark" ? "accent.highlight" : "chart.numeric";
  const amountInputStyles = {
    bg: "surface.accentTint",
    borderColor: "accent.highlight",
    boxShadow:
      tokens.colorMode === "dark"
        ? "0 0 0 1px var(--chakra-colors-accent-highlight)"
        : undefined,
    fontSize: "md",
    fontWeight: "900",
    _hover: {
      bg: "surface.accentTint",
      borderColor: "accent.highlight",
    },
    _focus: {
      bg: "surface.accentTint",
      borderColor: "border.focus",
      boxShadow: "focus",
    },
    _disabled: {
      opacity: 0.65,
      cursor: "not-allowed",
    },
  } as const;

  useEffect(() => {
    setAmountDirty(false);
    setExpiryEnabled(editedExpiry !== null);
    onValidationErrorChange(null);
  }, [editedRequest, editedExpiry, onValidationErrorChange]);

  useEffect(() => {
    if (metadataError) {
      onValidationErrorChange(metadataError);
      return;
    }

    try {
      assertErc7715PermissionEditIsAllowed(
        permissionRequest.request,
        editedRequest,
      );
      const nextStart = getErc7715PermissionStartTime(editedRequest);
      const nextExpiry = getErc7715PermissionExpiry(editedRequest);
      if (nextExpiry !== null && nextStart >= nextExpiry) {
        throw new Error("Expiration must be after start time");
      }
      onValidationErrorChange(null);
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid permission edits",
      );
    }
  }, [
    editedRequest,
    metadataError,
    onValidationErrorChange,
    permissionRequest.request,
  ]);

  useEffect(() => {
    if (!amountDirty) {
      setAmountInput(
        hasVerifiedDecimals ? formatAmountForInput(editedRequest, decimals) : "",
      );
    }
  }, [amountDirty, decimals, editedRequest, hasVerifiedDecimals]);

  useEffect(() => {
    if (!isStream) return;
    if (!hasVerifiedDecimals) {
      setInitialInput("");
      setMaxInput("");
      return;
    }
    setInitialInput(
      formatUnits(getErc7715PermissionInitialAmount(editedRequest), decimals),
    );
    const maxAmount = getErc7715PermissionMaxAmount(editedRequest);
    setMaxInput(
      isErc7715UnlimitedMaxAmount(maxAmount)
        ? ""
        : formatUnits(maxAmount, decimals),
    );
  }, [decimals, editedRequest, hasVerifiedDecimals, isStream]);

  const commit = (next: Erc7715PermissionRequest): boolean => {
    try {
      assertErc7715PermissionEditIsAllowed(
        permissionRequest.request,
        next,
      );
      const nextStart = getErc7715PermissionStartTime(next);
      const nextExpiry = getErc7715PermissionExpiry(next);
      if (nextExpiry !== null && nextStart >= nextExpiry) {
        throw new Error("Expiration must be after start time");
      }
      onValidationErrorChange(null);
      onEditedRequestChange(next);
      return true;
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid permission edits",
      );
      return false;
    }
  };

  const handleAmountChange = (value: string) => {
    setAmountDirty(true);
    setAmountInput(value);
    if (!hasVerifiedDecimals) {
      onValidationErrorChange(
        metadataError || "Token metadata must be verified before editing",
      );
      return;
    }
    try {
      const amount = parseUnits(value.trim(), decimals);
      if (amount <= 0n) throw new Error("Amount must be greater than zero");
      commit(
        isStream
          ? withErc7715PermissionAmountPerSecond(editedRequest, amount)
          : withErc7715PermissionAmount(editedRequest, amount),
      );
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid amount",
      );
    }
  };

  const handleInitialAmountChange = (value: string) => {
    setInitialInput(value);
    if (!hasVerifiedDecimals) {
      onValidationErrorChange(
        metadataError || "Token metadata must be verified before editing",
      );
      return;
    }
    try {
      const amount = value.trim() ? parseUnits(value.trim(), decimals) : 0n;
      commit(withErc7715PermissionInitialAmount(editedRequest, amount));
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid initial allowance",
      );
    }
  };

  const handleMaxAmountChange = (value: string) => {
    setMaxInput(value);
    if (!hasVerifiedDecimals) {
      onValidationErrorChange(
        metadataError || "Token metadata must be verified before editing",
      );
      return;
    }
    try {
      const amount = parseUnits(value.trim(), decimals);
      if (amount <= 0n) {
        throw new Error("Max allowance must be greater than zero");
      }
      commit(withErc7715PermissionMaxAmount(editedRequest, amount));
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid max allowance",
      );
    }
  };

  const handleMaxUnlimitedToggle = (checked: boolean) => {
    if (checked) {
      commit(
        withErc7715PermissionMaxAmount(
          editedRequest,
          BigInt(ERC7715_MAX_UINT256_HEX),
        ),
      );
      return;
    }

    const initialAmount = getErc7715PermissionInitialAmount(editedRequest);
    const amountPerSecond = getErc7715PermissionAmountPerSecond(editedRequest);
    const fallbackMax =
      initialAmount + amountPerSecond * BigInt(DAY_SECONDS);
    commit(withErc7715PermissionMaxAmount(editedRequest, fallbackMax));
  };

  const handleStartChange = (start: number) => {
    commit(withErc7715PermissionStartTime(editedRequest, start));
  };

  const handleExpiryChange = (expiry: number) => {
    commit(withErc7715PermissionExpiry(editedRequest, expiry));
  };

  const handleFrequencyChange = (value: string) => {
    const periodDuration = Number(value);
    if (!Number.isSafeInteger(periodDuration) || periodDuration <= 0) {
      onValidationErrorChange("Invalid frequency");
      return;
    }
    commit(
      withErc7715PermissionPeriodDuration(editedRequest, periodDuration),
    );
  };

  const handleExpiryToggle = (checked: boolean) => {
    const previous = expiryEnabled;
    if (!checked) {
      setExpiryEnabled(false);
      if (!commit(withErc7715PermissionExpiry(editedRequest, null))) {
        setExpiryEnabled(previous);
      }
      return;
    }
    const fallbackExpiry =
      originalExpiry ??
      Math.max(editedStart + 3600, Math.floor(Date.now() / 1000) + 60);
    setExpiryEnabled(true);
    if (!commit(withErc7715PermissionExpiry(editedRequest, fallbackExpiry))) {
      setExpiryEnabled(previous);
    }
  };

  const streamAmountPerSecond = isStream
    ? getErc7715PermissionAmountPerSecond(editedRequest)
    : 0n;
  const streamInitialAmount = isStream
    ? getErc7715PermissionInitialAmount(editedRequest)
    : 0n;
  const streamMaxAmount = isStream
    ? getErc7715PermissionMaxAmount(editedRequest)
    : 0n;
  const streamTotalExposure = isStream
    ? computeStreamTotalExposure({
        initialAmount: streamInitialAmount,
        maxAmount: streamMaxAmount,
        amountPerSecond: streamAmountPerSecond,
        startTime: editedStart,
        expiry: editedExpiry,
      })
    : null;
  const streamAvailablePerDay =
    streamAmountPerSecond * BigInt(DAY_SECONDS);

  return (
    <VStack align="stretch" spacing={3}>
      <Erc7715PermissionTokenCard
        asset={asset}
        chainId={permissionRequest.chainId}
        isNative={isNative}
      />

      {metadataError && (
        <Box
          bg="status.warning.tint"
          borderWidth="1px"
          borderColor="status.warning.border"
          borderRadius="md"
          p={3}
        >
          <Text fontSize="xs" color="status.warning.fg" fontWeight="800">
            {metadataError}
          </Text>
        </Box>
      )}

      {isPeriodic && (
        <HStack align="flex-start" spacing={3} w="full">
          <FormControl flex="1" minW={0}>
            <FormLabel fontSize="xs" fontWeight="900" color={amountLabelColor}>
              {amountFieldLabel(
                permissionRequest.permissionType,
                editedPeriodDuration,
              )}
            </FormLabel>
            <InputGroup>
              <Input
                value={amountInput}
                inputMode="decimal"
                isDisabled={isAmountInputDisabled}
                pr={amountUsdEstimate ? "86px" : undefined}
                onChange={(event) => handleAmountChange(event.target.value)}
                {...amountInputStyles}
              />
              {amountUsdEstimate && (
                <Box
                  maxW="78px"
                  pointerEvents="none"
                  position="absolute"
                  right={3}
                  top="50%"
                  transform="translateY(-50%)"
                  zIndex={1}
                >
                  <Text
                    color={amountEstimateColor}
                    fontSize="xs"
                    fontWeight="900"
                    noOfLines={1}
                    textAlign="right"
                  >
                    {amountUsdEstimate}
                  </Text>
                </Box>
              )}
            </InputGroup>
          </FormControl>

          <FormControl w="150px" flexShrink={0}>
            <FormLabel fontSize="xs" fontWeight="900" color="text.secondary">
              Frequency
            </FormLabel>
            <Select
              value={selectedFrequency}
              isDisabled={!canEditTerms}
              onChange={(event) => handleFrequencyChange(event.target.value)}
            >
              {hasCustomFrequency && editedPeriodDuration !== null && (
                <option value={editedPeriodDuration}>
                  {frequencyLabel(editedPeriodDuration)}
                </option>
              )}
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.seconds} value={option.seconds}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormControl>
        </HStack>
      )}

      {isStream && (
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FormLabel fontSize="xs" fontWeight="900" color={amountLabelColor}>
              {amountFieldLabel(
                permissionRequest.permissionType,
                editedPeriodDuration,
              )}
            </FormLabel>
            <InputGroup>
              <Input
                value={amountInput}
                inputMode="decimal"
                isDisabled={isAmountInputDisabled}
                pr={streamUsdEstimate ? "110px" : undefined}
                onChange={(event) => handleAmountChange(event.target.value)}
                {...amountInputStyles}
              />
              {streamUsdEstimate && (
                <Box
                  maxW="104px"
                  pointerEvents="none"
                  position="absolute"
                  right={3}
                  top="50%"
                  transform="translateY(-50%)"
                  zIndex={1}
                >
                  <Text
                    color={amountEstimateColor}
                    fontSize="xs"
                    fontWeight="900"
                    noOfLines={1}
                    textAlign="right"
                  >
                    {streamUsdEstimate}
                  </Text>
                </Box>
              )}
            </InputGroup>
          </FormControl>

          {hasVerifiedDecimals && (
            <VStack
              align="stretch"
              spacing={2}
              borderWidth="1px"
              borderColor="border.subtle"
              borderRadius="md"
              p={3}
            >
              <DetailRow
                label="Available per day"
                value={formatTokenAmount(
                  streamAvailablePerDay,
                  decimals,
                  asset.symbol,
                )}
              />
              <DetailRow
                label="Total exposure"
                value={
                  streamTotalExposure === null
                    ? "Unlimited"
                    : formatTokenAmount(
                        streamTotalExposure,
                        decimals,
                        asset.symbol,
                      )
                }
              />
            </VStack>
          )}

          <HStack align="flex-start" spacing={3}>
            <FormControl flex="1" minW={0}>
              <FormLabel fontSize="xs" fontWeight="900" color="text.secondary">
                Initial allowance
              </FormLabel>
              <Input
                value={initialInput}
                inputMode="decimal"
                isDisabled={isAmountInputDisabled}
                onChange={(event) =>
                  handleInitialAmountChange(event.target.value)
                }
              />
            </FormControl>

            <FormControl flex="1" minW={0}>
              <HStack justify="space-between" mb={2}>
                <FormLabel
                  fontSize="xs"
                  fontWeight="900"
                  color="text.secondary"
                  m={0}
                >
                  Max allowance
                </FormLabel>
                <Switch
                  size="sm"
                  isChecked={isErc7715UnlimitedMaxAmount(streamMaxAmount)}
                  isDisabled={isAmountInputDisabled}
                  onChange={(event) =>
                    handleMaxUnlimitedToggle(event.target.checked)
                  }
                />
              </HStack>
              {isErc7715UnlimitedMaxAmount(streamMaxAmount) ? (
                <Box
                  borderWidth="1px"
                  borderColor="border.default"
                  borderRadius="md"
                  px={3}
                  py={2}
                  minH="42px"
                >
                  <Text fontSize="sm" fontWeight="900" color="text.primary">
                    Unlimited
                  </Text>
                </Box>
              ) : (
                <Input
                  value={maxInput}
                  inputMode="decimal"
                  isDisabled={isAmountInputDisabled}
                  onChange={(event) =>
                    handleMaxAmountChange(event.target.value)
                  }
                />
              )}
            </FormControl>
          </HStack>
        </VStack>
      )}

      {!isPeriodic && !isStream && (
        <FormControl>
          <FormLabel fontSize="xs" fontWeight="900" color={amountLabelColor}>
            {amountFieldLabel(
              permissionRequest.permissionType,
              editedPeriodDuration,
            )}
          </FormLabel>
          <InputGroup>
            <Input
              value={amountInput}
              inputMode="decimal"
              isDisabled={isAmountInputDisabled}
              pr={amountUsdEstimate ? "96px" : undefined}
              onChange={(event) => handleAmountChange(event.target.value)}
              {...amountInputStyles}
            />
            {amountUsdEstimate && (
              <Box
                maxW="88px"
                pointerEvents="none"
                position="absolute"
                right={4}
                top="50%"
                transform="translateY(-50%)"
                zIndex={1}
              >
                <Text
                  color={amountEstimateColor}
                  fontSize="xs"
                  fontWeight="900"
                  noOfLines={1}
                  textAlign="right"
                >
                  {amountUsdEstimate}
                </Text>
              </Box>
            )}
          </InputGroup>
        </FormControl>
      )}

      <FormControl>
        <FormLabel fontSize="xs" fontWeight="900" color="text.secondary">
          Start time (UTC)
        </FormLabel>
        <UtcDateTimePicker
          valueSeconds={editedStart}
          disabled={!canEditTerms}
          label="Start time"
          onChange={handleStartChange}
        />
      </FormControl>

      <FormControl>
        <HStack justify="space-between" mb={2}>
          <FormLabel
            fontSize="xs"
            fontWeight="900"
            color="text.secondary"
            m={0}
          >
            Expiration date (UTC)
          </FormLabel>
          <Switch
            isChecked={expiryEnabled}
            isDisabled={!canEditExpiry}
            onChange={(event) => handleExpiryToggle(event.target.checked)}
          />
        </HStack>
        {expiryEnabled && (
          <UtcDateTimePicker
            valueSeconds={editedExpiry}
            disabled={!canEditExpiry}
            label="Expiration date"
            onChange={handleExpiryChange}
          />
        )}
        {!expiryEnabled && (
          <Text
            color="status.warning.fg"
            fontSize="sm"
            fontWeight="800"
            lineHeight="1.45"
            mt={2}
          >
            This permission is ongoing. We recommend setting an expiration date.
          </Text>
        )}
      </FormControl>
    </VStack>
  );
}

export function Erc7715PermissionEditableControls(
  props: Erc7715PermissionEditableControlsProps,
) {
  if (
    isErc7715TokenApprovalRevocationPermissionType(
      props.permissionRequest.permissionType,
    )
  ) {
    return <Erc7715ApprovalRevocationControls {...props} />;
  }

  return <Erc7715TokenPermissionEditableControls {...props} />;
}

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

import type { Erc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import { UtcDateTimePicker } from "@/components/UtcDateTimePicker";
import { formatUsd } from "@/lib/currencyFormatUtils";
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
  isErc7715StreamPermissionType,
  isErc7715UnlimitedMaxAmount,
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
import { Erc7715ApprovalRevocationControls } from "./Erc7715ApprovalRevocationControls";
import { permissionDatePickerError } from "./permissionPresentation";
import { StreamRateField } from "./StreamRateField";
import {
  formatStreamRateInput,
  parseStreamRateInput,
  streamRateRoundingNotice,
  type StreamRateUnit,
} from "./streamRateUnit";
import type { Erc7715PermissionEditableControlsProps } from "./types";

const DAY_SECONDS = 24 * 60 * 60;
const BRAND_SWITCH_SX = {
  "& .chakra-switch__track[data-checked]": {
    bg: "accent.highlight",
    borderColor: "accent.highlight",
  },
  "& .chakra-switch__track[data-checked]:hover": {
    bg: "accent.highlight",
    borderColor: "accent.highlight",
  },
  "& .chakra-switch__thumb[data-checked]": {
    bg: "accentFg.highlight",
  },
} as const;

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
    return "Stream rate";
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
  unit: StreamRateUnit,
): string {
  const trimmed = amountInput.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(trimmed)) return "";
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0 || priceUsd <= 0) return "";
  const dailyAmount = unit === "day" ? amount : amount * DAY_SECONDS;
  return `~${formatUsd(dailyAmount * priceUsd)}/day`;
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
      <Text fontSize="xs" color="fg.secondary" fontWeight="600">
        {label}
      </Text>
      <Text fontSize="xs" color="fg.primary" fontWeight="600" textAlign="right">
        {value}
      </Text>
    </HStack>
  );
}

function Erc7715TokenPermissionEditableControls({
  permissionRequest,
  editedRequest,
  asset,
  validationError,
  onEditedRequestChange,
  onValidationErrorChange,
}: Erc7715PermissionEditableControlsProps) {
  const [amountInput, setAmountInput] = useState("");
  const [initialInput, setInitialInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [amountDirty, setAmountDirty] = useState(false);
  const [streamRateUnit, setStreamRateUnit] =
    useState<StreamRateUnit>("second");
  const [streamRoundingMessage, setStreamRoundingMessage] = useState<
    string | null
  >(null);
  const originalExpiry = getErc7715PermissionExpiry(permissionRequest.request);
  const editedStart = getErc7715PermissionStartTime(editedRequest);
  const editedExpiry = getErc7715PermissionExpiry(editedRequest);
  const editedPeriodDuration =
    getErc7715PermissionPeriodDuration(editedRequest);
  const isPeriodic = isErc7715PeriodicPermissionType(
    permissionRequest.permissionType,
  );
  const isStream = isErc7715StreamPermissionType(
    permissionRequest.permissionType,
  );
  const canEditTerms = editedRequest.permission.isAdjustmentAllowed;
  const canEditExpiry = canEditTerms || !isStream;
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
    streamRateUnit,
  );
  const selectedFrequency = editedPeriodDuration?.toString() || "";
  const hasCustomFrequency =
    editedPeriodDuration !== null &&
    !FREQUENCY_OPTIONS.some(
      (option) => option.seconds === editedPeriodDuration,
    );
  const amountLabelColor = "fg.primary";
  const amountEstimateColor = "chart.numeric";
  const amountInputStyles = {
    fontSize: "md",
    fontWeight: "600",
    sx: { fontVariantNumeric: "tabular-nums" },
    _disabled: {
      cursor: "not-allowed",
    },
  } as const;

  useEffect(() => {
    setExpiryEnabled(editedExpiry !== null);
    onValidationErrorChange(null);
  }, [editedRequest, editedExpiry, onValidationErrorChange]);

  useEffect(() => {
    setAmountDirty(false);
    setStreamRateUnit("second");
    setStreamRoundingMessage(null);
  }, [permissionRequest.id]);

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
        hasVerifiedDecimals
          ? isStream
            ? formatStreamRateInput(
                getErc7715PermissionAmountPerSecond(editedRequest),
                decimals,
                streamRateUnit,
              )
            : formatAmountForInput(editedRequest, decimals)
          : "",
      );
    }
  }, [
    amountDirty,
    decimals,
    editedRequest,
    hasVerifiedDecimals,
    isStream,
    streamRateUnit,
  ]);

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
      if (isStream) {
        const parsed = parseStreamRateInput(
          value,
          decimals,
          streamRateUnit,
        );
        if (
          commit(
            withErc7715PermissionAmountPerSecond(
              editedRequest,
              parsed.amountPerSecond,
            ),
          )
        ) {
          setStreamRoundingMessage(
            streamRateRoundingNotice(parsed, decimals, asset.symbol),
          );
        }
        return;
      }

      const amount = parseUnits(value.trim(), decimals);
      if (amount <= 0n) throw new Error("Amount must be greater than zero");
      commit(withErc7715PermissionAmount(editedRequest, amount));
    } catch (error) {
      onValidationErrorChange(
        error instanceof Error ? error.message : "Invalid amount",
      );
    }
  };

  const handleStreamRateUnitChange = (unit: StreamRateUnit) => {
    setStreamRateUnit(unit);
    setAmountDirty(false);
    setStreamRoundingMessage(null);
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
      {metadataError && (
        <Box
          bg="status.warning.bg"
          borderWidth="1px"
          borderColor="status.warning.border"
          borderRadius="md"
          p={3}
        >
          <Text fontSize="xs" color="status.warning.fg" fontWeight="600">
            {metadataError}
          </Text>
        </Box>
      )}

      {isPeriodic && (
        <HStack align="flex-start" spacing={3} w="full">
          <FormControl flex="1" minW={0}>
            <FormLabel fontSize="xs" fontWeight="600" color={amountLabelColor}>
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
                    fontWeight="600"
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
            <FormLabel fontSize="xs" fontWeight="600" color="fg.secondary">
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
          <StreamRateField
            value={amountInput}
            unit={streamRateUnit}
            usdEstimate={streamUsdEstimate}
            roundingMessage={streamRoundingMessage}
            disabled={isAmountInputDisabled}
            onValueChange={handleAmountChange}
            onUnitChange={handleStreamRateUnitChange}
          />

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
              <HStack minH={6} mb={2}>
                <FormLabel
                  fontSize="xs"
                  fontWeight="600"
                  color="fg.secondary"
                  m={0}
                >
                  Initial allowance
                </FormLabel>
              </HStack>
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
              <HStack justify="space-between" minH={6} mb={2}>
                <FormLabel
                  fontSize="xs"
                  fontWeight="600"
                  color="fg.secondary"
                  m={0}
                >
                  Max allowance
                </FormLabel>
                <Switch
                  size="sm"
                  sx={BRAND_SWITCH_SX}
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
                  <Text fontSize="sm" fontWeight="600" color="fg.primary">
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
          <FormLabel fontSize="xs" fontWeight="600" color={amountLabelColor}>
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
                  fontWeight="600"
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
        <FormLabel fontSize="xs" fontWeight="600" color="fg.secondary">
          Start time (UTC)
        </FormLabel>
        <UtcDateTimePicker
          valueSeconds={editedStart}
          disabled={!canEditTerms}
          dateBoundaries={
            editedExpiry === null
              ? []
              : [{
                  seconds: editedExpiry,
                  direction: "maximum",
                  label: "Expiration date",
                }]
          }
          error={permissionDatePickerError(validationError, "start")}
          label="Start time"
          onChange={handleStartChange}
        />
      </FormControl>

      <FormControl>
        <HStack justify="space-between" mb={2}>
          <FormLabel
            fontSize="xs"
            fontWeight="600"
            color="fg.secondary"
            m={0}
          >
            Expiration date (UTC)
          </FormLabel>
          <Switch
            sx={BRAND_SWITCH_SX}
            isChecked={expiryEnabled}
            isDisabled={!canEditExpiry}
            onChange={(event) => handleExpiryToggle(event.target.checked)}
          />
        </HStack>
        {expiryEnabled && (
          <UtcDateTimePicker
            valueSeconds={editedExpiry}
            disabled={!canEditExpiry}
            dateBoundaries={[
              {
                seconds: editedStart,
                direction: "minimum",
                label: "Start date",
              },
              ...(isStream && originalExpiry !== null
                ? [
                    {
                      seconds: originalExpiry,
                      direction: "maximum" as const,
                      label: "Requested expiry (maximum)",
                    },
                  ]
                : []),
            ]}
            error={permissionDatePickerError(validationError, "expiration")}
            label="Expiration date"
            onChange={handleExpiryChange}
          />
        )}
        {!expiryEnabled && (
          <Text
            color="status.warning.fg"
            fontSize="sm"
            fontWeight="600"
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

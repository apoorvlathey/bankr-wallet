import { approvalRevocationMask } from "@/lib/erc7715ApprovalRevocation";
import { type Erc7715MappedCaveat } from "./caveatDefinitions";
import {
  addressValue,
  approvalRevocationTerms,
  asObject,
  caveat,
  delegationNonceCaveat,
  erc20PeriodTransferTerms,
  erc20StreamingTerms,
  exactEmptyCalldataCaveat,
  expiryFromRules,
  hexQuantityToBigInt,
  MAX_UINT256,
  maybeTimestampCaveat,
  nativePeriodTransferTerms,
  nativeStreamingTerms,
  numberValue,
  optionalHexQuantityToBigInt,
  zeroNativeValueCaveat,
} from "./caveatEncoding";
import { validateErc7715PermissionRequestPayload } from "./permissionValidation";

export function buildErc7715PermissionCaveats(
  request: Record<string, unknown>,
  requestIndex = 0,
  options: { delegationNonce: bigint },
): Erc7715MappedCaveat[] {
  const permissionType = validateErc7715PermissionRequestPayload(
    request,
    requestIndex,
  );
  const permission = asObject(request.permission);
  const data = asObject(permission.data);
  const expiry = expiryFromRules(request.rules);
  const nonceCaveat = delegationNonceCaveat(options.delegationNonce);
  const exactCalldataCaveat = exactEmptyCalldataCaveat();
  const valueLteCaveat = zeroNativeValueCaveat();

  switch (permissionType) {
    case "native-token-allowance": {
      const amountCaveat = caveat(
        "NativeTokenPeriodTransferEnforcer",
        nativePeriodTransferTerms({
          periodAmount: hexQuantityToBigInt(
            data.allowanceAmount,
            "native-token-allowance.data.allowanceAmount",
          ),
          periodDuration: MAX_UINT256,
          startDate: numberValue(
            data.startTime,
            "native-token-allowance.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        amountCaveat,
        exactCalldataCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "native-token-periodic": {
      const periodCaveat = caveat(
        "NativeTokenPeriodTransferEnforcer",
        nativePeriodTransferTerms({
          periodAmount: hexQuantityToBigInt(
            data.periodAmount,
            "native-token-periodic.data.periodAmount",
          ),
          periodDuration: numberValue(
            data.periodDuration,
            "native-token-periodic.data.periodDuration",
          ),
          startDate: numberValue(
            data.startTime,
            "native-token-periodic.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        periodCaveat,
        exactCalldataCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "native-token-stream": {
      const streamCaveat = caveat(
        "NativeTokenStreamingEnforcer",
        nativeStreamingTerms({
          initialAmount: optionalHexQuantityToBigInt(
            data.initialAmount,
            0n,
            "native-token-stream.data.initialAmount",
          ),
          maxAmount: optionalHexQuantityToBigInt(
            data.maxAmount,
            MAX_UINT256,
            "native-token-stream.data.maxAmount",
          ),
          amountPerSecond: hexQuantityToBigInt(
            data.amountPerSecond,
            "native-token-stream.data.amountPerSecond",
          ),
          startTime: numberValue(
            data.startTime,
            "native-token-stream.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        streamCaveat,
        exactCalldataCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "erc20-token-allowance": {
      const amountCaveat = caveat(
        "ERC20PeriodTransferEnforcer",
        erc20PeriodTransferTerms({
          tokenAddress: addressValue(
            data.tokenAddress,
            "erc20-token-allowance.data.tokenAddress",
          ),
          periodAmount: hexQuantityToBigInt(
            data.allowanceAmount,
            "erc20-token-allowance.data.allowanceAmount",
          ),
          periodDuration: MAX_UINT256,
          startDate: numberValue(
            data.startTime,
            "erc20-token-allowance.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        amountCaveat,
        valueLteCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "erc20-token-periodic": {
      const periodCaveat = caveat(
        "ERC20PeriodTransferEnforcer",
        erc20PeriodTransferTerms({
          tokenAddress: addressValue(
            data.tokenAddress,
            "erc20-token-periodic.data.tokenAddress",
          ),
          periodAmount: hexQuantityToBigInt(
            data.periodAmount,
            "erc20-token-periodic.data.periodAmount",
          ),
          periodDuration: numberValue(
            data.periodDuration,
            "erc20-token-periodic.data.periodDuration",
          ),
          startDate: numberValue(
            data.startTime,
            "erc20-token-periodic.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        periodCaveat,
        valueLteCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "erc20-token-stream": {
      const streamCaveat = caveat(
        "ERC20StreamingEnforcer",
        erc20StreamingTerms({
          tokenAddress: addressValue(
            data.tokenAddress,
            "erc20-token-stream.data.tokenAddress",
          ),
          initialAmount: optionalHexQuantityToBigInt(
            data.initialAmount,
            0n,
            "erc20-token-stream.data.initialAmount",
          ),
          maxAmount: optionalHexQuantityToBigInt(
            data.maxAmount,
            MAX_UINT256,
            "erc20-token-stream.data.maxAmount",
          ),
          amountPerSecond: hexQuantityToBigInt(
            data.amountPerSecond,
            "erc20-token-stream.data.amountPerSecond",
          ),
          startTime: numberValue(
            data.startTime,
            "erc20-token-stream.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        streamCaveat,
        valueLteCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "token-approval-revocation": {
      const approvalCaveat = caveat(
        "ApprovalRevocationEnforcer",
        approvalRevocationTerms(approvalRevocationMask(data)),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return timestampCaveat
        ? [approvalCaveat, nonceCaveat, timestampCaveat]
        : [approvalCaveat, nonceCaveat];
    }
  }
}

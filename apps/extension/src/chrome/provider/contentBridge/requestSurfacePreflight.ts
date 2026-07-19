import { validateExternalProviderMessage } from "../messageValidation";
import { isEvmAddress } from "../primitives";
import { batchPassesSurfacePreflight } from "./requestSurfaceBatchPreflight";
import { permissionPassesSurfacePreflight } from "./requestSurfacePermissionPreflight";
import { signaturePassesSurfacePreflight } from "./requestSurfaceSignaturePreflight";

export type ProviderRequestPreflightState = {
  address: string;
  accountType: string;
  chainId: number | null;
  dappConnected: boolean;
};

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addressMatchesActive(value: unknown, activeAddress: string): boolean {
  return (
    typeof value === "string" &&
    value.toLowerCase() === activeAddress.toLowerCase()
  );
}

function hasValidAccountBinding(
  type: string,
  message: Record<string, any>,
  state: ProviderRequestPreflightState,
): boolean {
  if (type === "i_dappAccounts") {
    return (
      message.method === "eth_requestAccounts" &&
      !state.dappConnected &&
      isEvmAddress(state.address)
    );
  }

  if (!state.dappConnected || !isEvmAddress(state.address)) return false;

  if (type === "i_sendTransaction") {
    return addressMatchesActive(message.from, state.address);
  }

  if (type === "i_signatureRequest") {
    const signerIndex = message.method === "personal_sign" ? 1 : 0;
    return (
      addressMatchesActive(message.params?.[signerIndex], state.address) &&
      signaturePassesSurfacePreflight(
        message.method,
        message.params,
        message.chainId,
      )
    );
  }

  if (type === "i_walletSendCalls") {
    if (!isRecord(message.params)) return false;
    return batchPassesSurfacePreflight(
      message.params,
      state.accountType,
      state.address,
    );
  }

  if (type === "i_walletExecutionPermissions") {
    return permissionPassesSurfacePreflight(
      message.params,
      message.chainId,
      state.accountType,
      state.address,
    );
  }

  return false;
}

function runtimeValidationEnvelope(
  type: string,
  message: Record<string, any>,
  chainId: number | null,
): Record<string, unknown> | null {
  if (type === "i_dappAccounts") {
    return {
      type: "requestDappConnection",
      requestId: message.id,
    };
  }

  if (type === "i_sendTransaction") {
    const { id, from, to, data, value, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas } =
      message;
    return {
      type: "sendTransaction",
      txId: id,
      providerChainId: chainId,
      tx: {
        from,
        to,
        data,
        value,
        chainId: message.chainId,
        ...(gas ? { gas } : {}),
        ...(gasPrice ? { gasPrice } : {}),
        ...(maxFeePerGas ? { maxFeePerGas } : {}),
        ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
      },
    };
  }

  if (type === "i_signatureRequest") {
    return {
      type: "signatureRequest",
      sigId: message.id,
      providerChainId: chainId,
      signature: {
        method: message.method,
        params: message.params,
        chainId: message.chainId,
      },
    };
  }

  if (type === "i_walletSendCalls") {
    if (message.params?.version !== "2.0.0") return null;
    return {
      type: "walletSendCalls",
      bundleId: message.id,
      providerChainId: chainId,
      params: message.params,
    };
  }

  if (type === "i_walletExecutionPermissions") {
    return {
      type: "walletExecutionPermissions",
      requestId: message.id,
      method: message.method,
      params: message.params,
      chainId: message.chainId,
      providerChainId: chainId,
    };
  }

  return null;
}

/**
 * Synchronous, content-script-owned rejection gate for the early sidepanel hop.
 * The background repeats every check authoritatively before persistence.
 */
export function providerRequestPassesSurfacePreflight(
  type: string,
  message: unknown,
  state: ProviderRequestPreflightState,
): boolean {
  if (!isRecord(message)) return false;
  const envelope = runtimeValidationEnvelope(type, message, state.chainId);
  if (!envelope) return false;
  const validation = validateExternalProviderMessage(envelope);
  return (
    validation.valid === true &&
    hasValidAccountBinding(type, message, state)
  );
}

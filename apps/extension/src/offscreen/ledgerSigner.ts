import {
  DeviceManagementKitBuilder,
  DeviceModelId,
  type DeviceManagementKit,
  type DeviceSessionId,
  type DiscoveredDevice,
} from "@ledgerhq/device-management-kit";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import {
  webHidIdentifier,
  webHidTransportFactory,
} from "@ledgerhq/device-transport-kit-web-hid";
import { LedgerError, LedgerErrorCode, normalizeLedgerError } from "../chrome/ledger/errors";
import { resolveTemplate, withoutMasterPrefix } from "../lib/bip32Path";

export type HdPathScheme = "ledgerLive" | "bip44" | "legacyMew" | "custom";
export type LedgerSignerStatus =
  | "connecting" | "awaiting-app" | "scanning"
  | "awaiting-confirmation" | "signing" | "success" | "error";
export type DispatchStatus = (status: LedgerSignerStatus, extra?: Record<string, unknown>) => void;
type Signature = { r: `0x${string}`; s: `0x${string}`; v: number };

const CANONICAL_PATH = "m/44'/60'/0'/0/0";
const DISCOVERY_TIMEOUT_MS = 8_000;
const ACTION_TIMEOUT_MS = 10 * 60_000;
let activeCancel: (() => void) | null = null;

export async function connectLedger(preferredProductName: string | undefined, dispatch: DispatchStatus): Promise<{
  deviceId: string; deviceLabel: string; deviceModel: string;
}> {
  return exclusive(async () => withSession(undefined, dispatch, async ({ dmk, sessionId }) => {
    dispatch("awaiting-app");
    const { address } = await getAddress(dmk, sessionId, CANONICAL_PATH);
    const device = dmk.getConnectedDevice({ sessionId });
    dispatch("success");
    return {
      deviceId: address.toLowerCase(),
      deviceLabel: modelLabel(device.modelId, device.name),
      deviceModel: device.modelId,
    };
  }, preferredProductName));
}

export async function scanAddresses(
  deviceId: string,
  startIndex: number,
  count: number,
  scheme: HdPathScheme,
  customTemplate: string | undefined,
  dispatch: DispatchStatus,
): Promise<Array<{ hdPath: string; hdIndex: number; address: `0x${string}` }>> {
  if (!Number.isSafeInteger(startIndex) || startIndex < 0 || count < 1 || count > 20) {
    throw new Error("Invalid Ledger scan range.");
  }
  return exclusive(async () => withSession(deviceId, dispatch, async ({ dmk, sessionId }) => {
    dispatch("scanning");
    const addresses = [];
    for (let index = startIndex; index < startIndex + count; index += 1) {
      const hdPath = pathForScheme(scheme, index, customTemplate);
      const { address } = await getAddress(dmk, sessionId, hdPath);
      addresses.push({ hdPath, hdIndex: index, address });
    }
    dispatch("success");
    return addresses;
  }));
}

export async function signTransaction(
  deviceId: string, hdPath: string, unsignedTx: `0x${string}`, dispatch: DispatchStatus,
): Promise<Signature> {
  return exclusive(async () => withSession(deviceId, dispatch, async ({ dmk, sessionId }) => {
    dispatch("signing");
    const signer = new SignerEthBuilder({ dmk, sessionId }).build();
    const output = await runAction<Signature>(
      signer.signTransaction(withoutMasterPrefix(hdPath), hexToBytes(unsignedTx)), dispatch,
    );
    dispatch("success");
    return normalizeSignature(output);
  }));
}

export async function signMessage(
  deviceId: string, hdPath: string, hex: `0x${string}`, dispatch: DispatchStatus,
): Promise<Signature> {
  return exclusive(async () => withSession(deviceId, dispatch, async ({ dmk, sessionId }) => {
    dispatch("signing");
    const signer = new SignerEthBuilder({ dmk, sessionId }).build();
    const output = await runAction<Signature>(
      signer.signMessage(withoutMasterPrefix(hdPath), hexToBytes(hex)), dispatch,
    );
    dispatch("success");
    return normalizeSignature(output);
  }));
}

export async function signTypedData(
  deviceId: string,
  hdPath: string,
  typedData: { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> },
  dispatch: DispatchStatus,
): Promise<Signature> {
  return exclusive(async () => withSession(deviceId, dispatch, async ({ dmk, sessionId }) => {
    dispatch("signing");
    const signer = new SignerEthBuilder({ dmk, sessionId }).build();
    const output = await runAction<Signature>(
      signer.signTypedData(withoutMasterPrefix(hdPath), typedData), dispatch,
    );
    dispatch("success");
    return normalizeSignature(output);
  }));
}

export function cancelActiveOperation(): void {
  activeCancel?.();
}

function pathForScheme(scheme: HdPathScheme, index: number, custom?: string): string {
  if (scheme === "ledgerLive") return `m/44'/60'/${index}'/0/0`;
  if (scheme === "bip44") return `m/44'/60'/0'/0/${index}`;
  if (scheme === "legacyMew") return `m/44'/60'/0'/${index}`;
  if (!custom) throw new Error("Enter a custom path containing {index}.");
  return resolveTemplate(custom, index);
}

async function exclusive<T>(run: () => Promise<T>): Promise<T> {
  if (activeCancel) {
    throw new LedgerError(LedgerErrorCode.TRANSPORT_BUSY, "Another Ledger operation is in progress.");
  }
  activeCancel = () => undefined;
  try { return await run(); } finally { activeCancel = null; }
}

interface SessionContext { dmk: DeviceManagementKit; sessionId: DeviceSessionId }

async function withSession<T>(
  expectedDeviceId: string | undefined,
  dispatch: DispatchStatus,
  run: (context: SessionContext) => Promise<T>,
  preferredProductName?: string,
): Promise<T> {
  const dmk = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
  let sessionId: DeviceSessionId | null = null;
  try {
    dispatch("connecting");
    const discovered = await firstAvailableDevices(dmk);
    const devices = preferredProductName
      ? [...discovered].sort((left, right) =>
          Number(right.name === preferredProductName) - Number(left.name === preferredProductName))
      : discovered;
    for (const device of devices) {
      sessionId = await dmk.connect({ device });
      if (!expectedDeviceId) break;
      const identity = await getAddress(dmk, sessionId, CANONICAL_PATH);
      if (identity.address.toLowerCase() === expectedDeviceId.toLowerCase()) break;
      await dmk.disconnect({ sessionId });
      sessionId = null;
    }
    if (!sessionId) {
      throw new LedgerError(
        LedgerErrorCode.DEVICE_DISCONNECTED,
        "Connect the Ledger used by this account and try again.",
      );
    }
    return await run({ dmk, sessionId });
  } catch (error) {
    throw normalizeLedgerError(error);
  } finally {
    if (sessionId) await dmk.disconnect({ sessionId }).catch(() => undefined);
    dmk.close();
  }
}

function firstAvailableDevices(dmk: DeviceManagementKit): Promise<DiscoveredDevice[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe(): void } | null = null;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      subscription?.unsubscribe();
      complete();
    };
    const observable = dmk.listenToAvailableDevices({ transport: webHidIdentifier });
    subscription = observable.subscribe({
      next(devices) {
        if (devices.length) finish(() => resolve(devices));
      },
      error(error) { finish(() => reject(error)); },
    });
    if (settled) {
      subscription.unsubscribe();
    } else {
      timer = setTimeout(() => {
        finish(() => reject(new LedgerError(
          LedgerErrorCode.PERMISSION_DENIED,
          "Plug in your Ledger, unlock it, and open the Ethereum app.",
        )));
      }, DISCOVERY_TIMEOUT_MS);
    }
  });
}

async function getAddress(dmk: DeviceManagementKit, sessionId: DeviceSessionId, path: string) {
  const signer = new SignerEthBuilder({ dmk, sessionId }).build();
  return runAction<{ address: `0x${string}`; publicKey: string }>(
    signer.getAddress(withoutMasterPrefix(path), { checkOnDevice: false }), () => undefined,
  );
}

function runAction<T>(
  action: { observable: { subscribe(observer: Record<string, (value: never) => void>): { unsubscribe(): void } }; cancel(): void },
  dispatch: DispatchStatus,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe(): void } | null = null;
    const settle = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      subscription?.unsubscribe();
      complete();
    };
    activeCancel = () => {
      action.cancel();
      settle(() => reject(
        new LedgerError(LedgerErrorCode.USER_REJECTED, "Ledger operation cancelled."),
      ));
    };
    subscription = action.observable.subscribe({
      next(state: never) {
        const value = state as { status: string; output?: T; error?: unknown; intermediateValue?: { requiredUserInteraction?: string } };
        if (value.status === "pending" && value.intermediateValue?.requiredUserInteraction !== "none") {
          dispatch("awaiting-confirmation", { interaction: value.intermediateValue?.requiredUserInteraction });
        } else if (value.status === "completed") {
          settle(() => resolve(value.output as T));
        } else if (value.status === "error") {
          settle(() => reject(value.error));
        } else if (value.status === "stopped") {
          settle(() => reject(
            new LedgerError(LedgerErrorCode.USER_REJECTED, "Ledger operation cancelled."),
          ));
        }
      },
      error(error: never) { settle(() => reject(error)); },
    });
    if (settled) {
      subscription.unsubscribe();
    } else {
      timer = setTimeout(() => {
        action.cancel();
        settle(() => reject(new LedgerError(
          LedgerErrorCode.DEVICE_DISCONNECTED,
          "Ledger did not respond. Reconnect it and try again.",
        )));
      }, ACTION_TIMEOUT_MS);
    }
  });
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const value = hex.slice(2);
  if (value.length % 2 || !/^[0-9a-f]*$/i.test(value)) throw new Error("Invalid hex payload.");
  return Uint8Array.from(value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function normalizeSignature(signature: Signature): Signature {
  const hex = (value: string): `0x${string}` => value.startsWith("0x") ? value as `0x${string}` : `0x${value}`;
  return { r: hex(signature.r), s: hex(signature.s), v: signature.v };
}

function modelLabel(model: DeviceModelId, fallback: string): string {
  return ({
    [DeviceModelId.NANO_S]: "Ledger Nano S",
    [DeviceModelId.NANO_SP]: "Ledger Nano S Plus",
    [DeviceModelId.NANO_X]: "Ledger Nano X",
    [DeviceModelId.STAX]: "Ledger Stax",
    [DeviceModelId.FLEX]: "Ledger Flex",
    [DeviceModelId.APEX]: "Ledger Apex",
  } as Record<DeviceModelId, string>)[model] ?? fallback ?? "Ledger";
}

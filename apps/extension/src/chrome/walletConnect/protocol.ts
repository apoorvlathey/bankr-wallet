import {
  removeWalletConnectPendingRequest,
  saveWalletConnectTerminalResponse,
  type WalletConnectPendingRequest,
  type WalletConnectTerminalResponse,
  type WalletConnectTerminalResponseInput,
} from "./storage";

export type WalletKitLike = {
  getActiveSessions: () => Record<string, any>;
  respondSessionRequest: (params: any) => Promise<void>;
  emitSessionEvent?: (params: any) => Promise<void>;
};

const responseDeliveries = new Map<string, Promise<void>>();

function responsePayload(
  requestId: number,
  terminal: WalletConnectTerminalResponse,
): Record<string, unknown> {
  return terminal.kind === "result"
    ? { id: requestId, jsonrpc: "2.0", result: terminal.value }
    : {
        id: requestId,
        jsonrpc: "2.0",
        error: { code: terminal.code, message: terminal.message },
      };
}

function runDeliverySingleFlight(
  routeId: string,
  deliver: () => Promise<void>,
): Promise<void> {
  const existing = responseDeliveries.get(routeId);
  if (existing) return existing;
  const operation = deliver().finally(() => {
    if (responseDeliveries.get(routeId) === operation) {
      responseDeliveries.delete(routeId);
    }
  });
  responseDeliveries.set(routeId, operation);
  return operation;
}

async function deliverSessionResponse(
  kit: WalletKitLike,
  topic: string,
  requestId: number,
  terminal: WalletConnectTerminalResponseInput,
): Promise<void> {
  const routed = await saveWalletConnectTerminalResponse(
    topic,
    requestId,
    terminal,
  );
  const storedTerminal = routed?.terminalResponse;
  const fallbackTerminal = {
    ...terminal,
    timestamp: Date.now(),
  } as WalletConnectTerminalResponse;
  const payload = responsePayload(
    requestId,
    storedTerminal ?? fallbackTerminal,
  );

  const deliver = async () => {
    await kit.respondSessionRequest({ topic, response: payload });
    if (routed) {
      await removeWalletConnectPendingRequest(routed.id);
    }
  };
  if (routed) {
    await runDeliverySingleFlight(routed.id, deliver);
  } else {
    await deliver();
  }
}

export async function respondSessionRequest(
  kit: WalletKitLike,
  args: any,
  result: unknown,
): Promise<void> {
  await deliverSessionResponse(kit, args.topic, args.id, {
    kind: "result",
    value: result,
  });
}

export async function rejectSessionRequest(
  kit: WalletKitLike,
  args: any,
  code: number,
  message: string,
): Promise<void> {
  await deliverSessionResponse(kit, args.topic, args.id, {
    kind: "error",
    code,
    message: message.slice(0, 1_000),
  });
}

/**
 * Send a response without consulting or mutating the durable route map.
 * Reserved for malformed pre-claim input and duplicate in-flight deliveries:
 * either case must not commit an error onto another handler's owner route.
 */
export async function rejectUnroutedSessionRequest(
  kit: WalletKitLike,
  args: any,
  code: number,
  message: string,
): Promise<void> {
  await kit.respondSessionRequest({
    topic: args.topic,
    response: {
      id: args.id,
      jsonrpc: "2.0",
      error: { code, message: message.slice(0, 1_000) },
    },
  });
}

/** A duplicate in-flight delivery must not overwrite/release the owner route. */
export async function rejectDuplicateSessionRequest(
  kit: WalletKitLike,
  args: any,
  message = "WalletConnect request is already pending",
): Promise<void> {
  await rejectUnroutedSessionRequest(kit, args, -32002, message);
}

export async function replayWalletConnectTerminalResponse(
  kit: WalletKitLike,
  pending: WalletConnectPendingRequest,
): Promise<void> {
  if (!pending.terminalResponse) return;
  await runDeliverySingleFlight(pending.id, async () => {
    await kit.respondSessionRequest({
      topic: pending.topic,
      response: responsePayload(pending.requestId, pending.terminalResponse!),
    });
    await removeWalletConnectPendingRequest(pending.id);
  });
}

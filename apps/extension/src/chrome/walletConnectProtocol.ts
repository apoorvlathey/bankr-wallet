export type WalletKitLike = {
  getActiveSessions: () => Record<string, any>;
  respondSessionRequest: (params: any) => Promise<void>;
  emitSessionEvent?: (params: any) => Promise<void>;
};

export async function respondSessionRequest(
  kit: WalletKitLike,
  args: any,
  result: unknown,
): Promise<void> {
  await kit.respondSessionRequest({
    topic: args.topic,
    response: {
      id: args.id,
      jsonrpc: "2.0",
      result,
    },
  });
}

export async function rejectSessionRequest(
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
      error: { code, message },
    },
  });
}

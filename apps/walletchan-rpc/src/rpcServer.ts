import { serve, type ServerType } from "@hono/node-server";
import { Hono, type Context } from "hono";
import type { CliConfig } from "./cli.js";
import { formatChains } from "./chains.js";
import { log } from "./logger.js";
import { handleRpcRequest, type RpcContext } from "./rpcHandler.js";
import { errorResponse, type JsonRpcRequest, type JsonRpcResponse } from "./rpcTypes.js";
import { formatRuntimeSkill } from "./skill.js";

export function startRpcServer(config: CliConfig, context: RpcContext): ServerType {
  const app = new Hono();

  async function handleRpc(c: { req: { json: () => Promise<unknown> }; json: (data: unknown, status?: number) => Response; body: (data: null, status: number) => Response }): Promise<Response> {
    try {
      const body = await c.req.json();

      if (Array.isArray(body)) {
        if (body.length === 0) {
          return c.json(errorResponse(null, -32600, "Invalid empty JSON-RPC batch"), 400);
        }
        const responses = await Promise.all(
          body.map((request) => handleRpcRequest(request as JsonRpcRequest, context)),
        );
        return c.json(responses.filter((response): response is JsonRpcResponse => response !== null));
      }

      const response = await handleRpcRequest(body as JsonRpcRequest, context);
      return response ? c.json(response) : c.body(null, 204);
    } catch {
      return c.json(errorResponse(null, -32700, "Parse error"), 400);
    }
  }

  app.post("/", handleRpc);
  app.post("/rpc", handleRpc);
  app.get("/skill.md", (c) => skillResponse(c, config, context));
  app.get("/SKILL.md", (c) => skillResponse(c, config, context));
  app.get("/health", (c) =>
    c.json({
      ok: true,
      connected: context.wallet.connected,
      accounts: context.wallet.getAccounts(),
      activeChainId: context.getActiveChain().chainId,
      chains: context.chains.map((chain) => ({
        name: chain.name,
        chainId: chain.chainId,
      })),
    }),
  );
  app.get("/session", (c) =>
    c.json({
      connected: context.wallet.connected,
      activeChainId: context.getActiveChain().chainId,
      chains: formatChains(context.chains),
      session: context.wallet.connected ? context.wallet.getSessionInfo() : null,
    }),
  );
  app.get("/pairing", async (c) => {
    try {
      const pairingUri = await context.wallet.getPairingUri();
      return c.json({
        connected: context.wallet.connected,
        pairingUri,
        activeChainId: context.getActiveChain().chainId,
        chains: context.chains.map((chain) => ({
          name: chain.name,
          chainId: chain.chainId,
        })),
      });
    } catch (error) {
      return c.json(
        {
          connected: false,
          pairingUri: null,
          error: error instanceof Error ? error.message : "Failed to create WalletConnect pairing URI",
        },
        500,
      );
    }
  });

  return serve(
    {
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
    },
    () => {
      log.dim("RPC server ready");
    },
  );
}

function skillResponse(c: Context, config: CliConfig, context: RpcContext): Response {
  return c.body(formatRuntimeSkill(config, context), 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
}

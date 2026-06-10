import { randomBytes } from "node:crypto";
import { serve, type ServerType } from "@hono/node-server";
import { Hono, type Context } from "hono";
import QRCode from "qrcode";
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
  app.get("/health", (c) => {
    const accounts = context.wallet.getAccounts();
    const connected = context.wallet.connected && accounts.length > 0;
    return c.json({
      ok: true,
      connected,
      accounts,
      batching: context.wallet.getBatchingInfo(),
      activeChainId: context.getActiveChain().chainId,
      chains: context.chains.map((chain) => ({
        name: chain.name,
        chainId: chain.chainId,
      })),
    });
  });
  app.get("/session", (c) => {
    const accounts = context.wallet.getAccounts();
    const connected = context.wallet.connected && accounts.length > 0;
    return c.json({
      connected,
      batching: context.wallet.getBatchingInfo(),
      activeChainId: context.getActiveChain().chainId,
      chains: formatChains(context.chains),
      session: connected ? context.wallet.getSessionInfo() : null,
    });
  });
  app.get("/qr", (c) => pairingQrResponse(c, config, context));
  app.get("/uri", (c) => pairingQrResponse(c, config, context));
  app.get("/pairing", async (c) => {
    try {
      const forceNewSession = isTruthyQuery(c.req.query("force"));
      if (forceNewSession) {
        await context.wallet.disconnectStored("WalletChan RPC pairing was reset by request");
      }
      const pairingUri = await context.wallet.getPairingUri();
      const accounts = context.wallet.getAccounts();
      const connected = context.wallet.connected && accounts.length > 0;
      return c.json({
        connected,
        accounts,
        pairingUri,
        pairingUrl: formatPairingUrl(config),
        batching: context.wallet.getBatchingInfo(),
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
          pairingUrl: formatPairingUrl(config),
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

function isTruthyQuery(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

async function pairingQrResponse(c: Context, config: CliConfig, context: RpcContext): Promise<Response> {
  const format = c.req.query("format");
  const forceNewSession = isTruthyQuery(c.req.query("force"));
  if (format === "json") {
    try {
      return c.json(await getPairingViewState(config, context, true, { forceNewSession }));
    } catch (error) {
      return c.json(
        {
          connected: false,
          pairingUri: null,
          pairingUrl: formatPairingUrl(config),
          qrDataUrl: null,
          error: error instanceof Error ? error.message : "Failed to create WalletConnect pairing URI",
        },
        500,
      );
    }
  }

  return qrPageResponse(c, config, context, { forceNewSession });
}

function skillResponse(c: Context, config: CliConfig, context: RpcContext): Response {
  return c.body(formatRuntimeSkill(config, context), 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
}

async function qrPageResponse(
  c: Context,
  config: CliConfig,
  context: RpcContext,
  options: { forceNewSession?: boolean } = {},
): Promise<Response> {
  const nonce = randomBytes(16).toString("base64");
  const initialState = await getPairingViewState(config, context, true, options).catch((error) => ({
    connected: false,
    accounts: [],
    pairingUri: null,
    pairingUrl: formatPairingUrl(config),
    qrDataUrl: null,
    forceNewSession: options.forceNewSession === true,
    activeChainId: context.getActiveChain().chainId,
    chains: context.chains.map((chain) => ({
      name: chain.name,
      chainId: chain.chainId,
    })),
    error: error instanceof Error ? error.message : "Failed to create WalletConnect pairing URI",
  }));

  return c.body(formatQrPage(initialState, nonce), 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": [
      "default-src 'none'",
      "img-src data:",
      "connect-src 'self'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
  });
}

async function getPairingViewState(
  config: CliConfig,
  context: RpcContext,
  includeQr: boolean,
  options: { forceNewSession?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (options.forceNewSession) {
    await context.wallet.disconnectStored("WalletChan RPC pairing was reset by request");
  }
  const accounts = context.wallet.getAccounts();
  const connected = context.wallet.connected && accounts.length > 0;
  const pairingUri = await context.wallet.getPairingUri();
  const effectiveUri = connected ? null : pairingUri;
  return {
    connected,
    accounts,
    batching: context.wallet.getBatchingInfo(),
    pairingUri: effectiveUri,
    pairingUrl: formatPairingUrl(config),
    qrDataUrl: effectiveUri && includeQr ? await createQrDataUrl(effectiveUri) : null,
    forceNewSession: options.forceNewSession === true,
    activeChainId: context.getActiveChain().chainId,
    chains: context.chains.map((chain) => ({
      name: chain.name,
      chainId: chain.chainId,
    })),
    message: connected
      ? "A wallet is connected to WalletChan RPC."
      : effectiveUri
        ? "Connect your wallet to WalletChan RPC via WalletConnect."
        : "WalletChan RPC is waiting for a WalletConnect URI.",
  };
}

async function createQrDataUrl(uri: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 8,
      type: "image/png",
    });
  } catch {
    return null;
  }
}

function formatPairingUrl(config: CliConfig): string {
  const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  return `http://${host}:${config.port}/qr`;
}

function formatQrPage(initialState: Record<string, unknown>, nonce: string): string {
  const initialJson = escapeScriptJson(JSON.stringify(initialState));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WalletConnect Pairing</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light;
      --red: #d02020;
      --blue: #1040c0;
      --yellow: #f0c020;
      --ink: #111111;
      --paper: #f8f6ef;
      --panel: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(92vw, 440px);
      padding: 28px;
      border: 4px solid var(--ink);
      background: var(--panel);
      box-shadow: 10px 10px 0 var(--blue);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .status {
      margin: 0 0 18px;
      min-height: 24px;
      font-weight: 700;
    }
    .qr-wrap {
      display: grid;
      place-items: center;
      min-height: 300px;
      border: 3px solid var(--ink);
      background: #ffffff;
      margin: 18px 0;
    }
    .qr-wrap img {
      width: min(280px, 78vw);
      height: min(280px, 78vw);
      image-rendering: pixelated;
    }
    .connected {
      display: none;
      padding: 28px;
      text-align: center;
      font-weight: 800;
      background: var(--yellow);
      border: 3px solid var(--ink);
    }
    textarea {
      width: 100%;
      min-height: 88px;
      resize: vertical;
      border: 3px solid var(--ink);
      padding: 10px;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--ink);
      background: #ffffff;
    }
    button {
      width: 100%;
      height: 48px;
      margin-top: 12px;
      border: 3px solid var(--ink);
      background: var(--yellow);
      color: var(--ink);
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 5px 5px 0 var(--ink);
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
      box-shadow: none;
    }
    button.secondary {
      background: var(--blue);
      color: #ffffff;
    }
    .hint {
      margin: 14px 0 0;
      font-size: 13px;
      line-height: 1.45;
    }
    .error { color: var(--red); }
  </style>
</head>
<body>
  <main>
    <h1>WalletConnect Pairing</h1>
    <p id="status" class="status">Loading pairing state...</p>
    <div id="qrWrap" class="qr-wrap">
      <img id="qr" alt="WalletConnect pairing QR code">
      <div id="connected" class="connected">Wallet connected</div>
    </div>
    <textarea id="uri" readonly aria-label="WalletConnect URI"></textarea>
    <button id="copy" type="button">Copy URI</button>
    <button id="fresh" class="secondary" type="button">New Wallet URI</button>
    <p class="hint">Scan this QR from any WalletConnect-capable wallet, or copy and paste the URI.</p>
  </main>
  <script id="initial-state" type="application/json" nonce="${nonce}">${initialJson}</script>
  <script nonce="${nonce}">
    const stateEl = document.getElementById("initial-state");
    const statusEl = document.getElementById("status");
    const qrEl = document.getElementById("qr");
    const connectedEl = document.getElementById("connected");
    const uriEl = document.getElementById("uri");
    const copyEl = document.getElementById("copy");
    const freshEl = document.getElementById("fresh");
    let currentUri = "";

    function render(state) {
      const connected = state && state.connected === true;
      const uri = !connected && typeof state.pairingUri === "string" ? state.pairingUri : "";
      currentUri = uri;
      statusEl.textContent = state && typeof state.message === "string"
        ? state.message
        : connected
          ? "A wallet is connected to WalletChan RPC."
          : "Waiting for a WalletConnect URI.";
      statusEl.className = state && state.error ? "status error" : "status";
      qrEl.style.display = uri && state.qrDataUrl ? "block" : "none";
      connectedEl.style.display = connected ? "block" : "none";
      if (uri && state.qrDataUrl) qrEl.src = state.qrDataUrl;
      uriEl.value = uri;
      copyEl.disabled = !uri;
      copyEl.textContent = uri ? "Copy URI" : connected ? "Connected" : "Waiting";
      freshEl.disabled = false;
    }

    async function refresh(force = false) {
      try {
        const response = await fetch(force ? "/qr?format=json&force=true" : "/qr?format=json", { cache: "no-store" });
        render(await response.json());
      } catch (error) {
        render({
          connected: false,
          pairingUri: currentUri,
          qrDataUrl: qrEl.src || null,
          error: String(error),
          message: "Could not refresh pairing state. The last URI remains below if available."
        });
      }
    }

    copyEl.addEventListener("click", async () => {
      if (!currentUri) return;
      try {
        await navigator.clipboard.writeText(currentUri);
      } catch {
        uriEl.focus();
        uriEl.select();
        document.execCommand("copy");
      }
      copyEl.textContent = "Copied";
      window.setTimeout(() => {
        if (currentUri) copyEl.textContent = "Copy URI";
      }, 1500);
    });

    freshEl.addEventListener("click", () => {
      freshEl.disabled = true;
      statusEl.textContent = "Generating a fresh WalletConnect URI...";
      refresh(true);
    });

    render(JSON.parse(stateEl.textContent || "{}"));
    window.setInterval(refresh, 2500);
  </script>
</body>
</html>`;
}

function escapeScriptJson(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

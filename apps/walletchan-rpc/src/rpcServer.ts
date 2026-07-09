import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { serve, type ServerType } from "@hono/node-server";
import { Hono, type Context } from "hono";
import QRCode from "qrcode";
import type { CliConfig } from "./cli.js";
import { formatChains } from "./chains.js";
import { log } from "./logger.js";
import { handleRpcRequest, type RpcContext } from "./rpcHandler.js";
import { errorResponse, type JsonRpcRequest, type JsonRpcResponse } from "./rpcTypes.js";
import { formatRuntimeSkill } from "./skill.js";
import type { WalletTransport } from "./walletBridge.js";

const WALLETCHAN_ICON_BYTES = readFileSync(new URL("../assets/walletchan-icon.png", import.meta.url));

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
  app.get("/assets/walletchan-icon.png", (c) => {
    return c.body(new Uint8Array(WALLETCHAN_ICON_BYTES), 200, {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    });
  });
  app.get("/health", (c) => {
    const accounts = context.wallet.getAccounts();
    const connected = context.wallet.connected && accounts.length > 0;
    return c.json({
      ok: true,
      connected,
      accounts,
      batching: context.wallet.getBatchingInfo(),
      transport: context.wallet.transport,
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
      transport: context.wallet.transport,
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
      const forceRequest = isTruthyQuery(c.req.query("forceRequest"));
      const transport = parseTransportQuery(c.req.query("transport"));
      const account = parseAccountQuery(c.req.query("account"));
      await applyPairingOptions(context, { account, forceNewSession, forceRequest, transport });
      const pairingUri = await context.wallet.getPairingUri();
      const accounts = context.wallet.getAccounts();
      const connected = context.wallet.connected && accounts.length > 0;
      return c.json({
        connected,
        accounts,
        pairingUri,
        pairingUrl: formatPairingUrl(config),
        pairingLabel: getPairingLabel(context),
        transport: context.wallet.transport,
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
          pairingLabel: getPairingLabel(context),
          transport: context.wallet.transport,
          error: error instanceof Error ? error.message : `Failed to create ${getPairingLabel(context)} URI`,
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

function parseTransportQuery(value: string | undefined): WalletTransport | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "walletconnect" || normalized === "wc") return "walletconnect";
  if (
    normalized === "metamask-connect" ||
    normalized === "metamask" ||
    normalized === "mm"
  ) {
    return "metamask-connect";
  }
  throw new Error("transport must be walletconnect or metamask-connect");
}

function parseAccountQuery(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return trimmed.toLowerCase();
  throw new Error("account must be an EVM address");
}

async function pairingQrResponse(c: Context, config: CliConfig, context: RpcContext): Promise<Response> {
  const format = c.req.query("format");
  const forceNewSession = isTruthyQuery(c.req.query("force"));
  const forceRequest = isTruthyQuery(c.req.query("forceRequest"));
  const transport = parseTransportQuery(c.req.query("transport"));
  const account = parseAccountQuery(c.req.query("account"));
  if (format === "json") {
    try {
      return c.json(await getPairingViewState(config, context, true, {
        account,
        forceNewSession,
        forceRequest,
        transport,
      }));
    } catch (error) {
      return c.json(
        {
          connected: false,
          pairingUri: null,
          pairingUrl: formatPairingUrl(config),
          pairingLabel: getPairingLabel(context),
          transport: context.wallet.transport,
          qrDataUrl: null,
          error: error instanceof Error ? error.message : `Failed to create ${getPairingLabel(context)} URI`,
        },
        500,
      );
    }
  }

  return qrPageResponse(c, config, context, {
    account,
    forceNewSession,
    forceRequest,
    transport,
  });
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
  options: {
    account?: string | null;
    forceNewSession?: boolean;
    forceRequest?: boolean;
    transport?: WalletTransport | null;
  } = {},
): Promise<Response> {
  const nonce = randomBytes(16).toString("base64");
  const initialState = await getPairingViewState(config, context, true, options).catch((error) => ({
    connected: false,
    accounts: [],
    pairingUri: null,
    pairingUrl: formatPairingUrl(config),
    pairingLabel: getPairingLabel(context),
    transport: context.wallet.transport,
    qrDataUrl: null,
    forceNewSession: options.forceNewSession === true,
    activeChainId: context.getActiveChain().chainId,
    chains: context.chains.map((chain) => ({
      name: chain.name,
      chainId: chain.chainId,
    })),
    error: error instanceof Error ? error.message : `Failed to create ${getPairingLabel(context)} URI`,
  }));

  return c.body(formatQrPage(initialState, nonce), 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": [
        "default-src 'none'",
        "img-src 'self' data:",
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
  options: {
    account?: string | null;
    forceNewSession?: boolean;
    forceRequest?: boolean;
    transport?: WalletTransport | null;
  } = {},
): Promise<Record<string, unknown>> {
  await applyPairingOptions(context, options);
  const accounts = context.wallet.getAccounts();
  const connected = context.wallet.connected && accounts.length > 0;
  const pairingUri = await context.wallet.getPairingUri();
  const effectiveUri = connected ? null : pairingUri;
  return {
    connected,
    accounts,
    batching: context.wallet.getBatchingInfo(),
    transport: context.wallet.transport,
    pairingLabel: getPairingLabel(context),
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
        ? `Connect your wallet to WalletChan RPC via ${getPairingLabel(context)}.`
        : `WalletChan RPC is waiting for a ${getPairingLabel(context)} URI.`,
  };
}

async function applyPairingOptions(
  context: RpcContext,
  options: {
    account?: string | null;
    forceNewSession?: boolean;
    forceRequest?: boolean;
    transport?: WalletTransport | null;
  },
): Promise<void> {
  const accountRequest = options.account || options.forceRequest;
  if (options.transport && options.transport !== context.wallet.transport) {
    if (!context.switchWalletTransport) {
      throw new Error("Wallet transport switching is not available in this RPC process");
    }
    await context.switchWalletTransport(options.transport, {
      account: options.account || undefined,
      forceNewSession: options.forceNewSession === true,
      forceRequest: options.forceRequest === true,
    });
    return;
  }

  if (options.forceNewSession) {
    await context.wallet.disconnectStored("WalletChan RPC pairing was reset by request");
  }

  if (accountRequest) {
    if (!context.wallet.requestAccount) {
      throw new Error(`${context.wallet.transport} does not support account-specific connection requests`);
    }
    await context.wallet.requestAccount({
      account: options.account || undefined,
      forceRequest: options.forceRequest === true,
    });
  }
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

function getPairingLabel(context: RpcContext): string {
  return context.wallet.transport === "metamask-connect" ? "MetaMask Connect" : "WalletConnect";
}

function formatQrPage(initialState: Record<string, unknown>, nonce: string): string {
  const initialJson = escapeScriptJson(JSON.stringify(initialState));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wallet Pairing</title>
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
      place-items: start center;
      padding: 24px 0 40px;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .page {
      width: min(92vw, 440px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0 0 14px;
      color: var(--ink);
      font-size: 18px;
      font-weight: 900;
      line-height: 1;
    }
    .brand img {
      width: 24px;
      height: 24px;
      display: block;
      border: 2px solid var(--ink);
      background: #ffffff;
      object-fit: contain;
    }
    main {
      width: 100%;
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
      overflow: hidden;
      position: relative;
    }
    .qr-wrap.refreshed {
      animation: qrFrameRefresh 520ms ease-out;
    }
    .qr-wrap img {
      width: min(280px, 78vw);
      height: min(280px, 78vw);
      image-rendering: pixelated;
      transition: opacity 180ms ease, transform 180ms ease;
    }
    .qr-wrap.refreshed img {
      animation: qrImageRefresh 520ms ease-out;
    }
    .connected {
      display: none;
      padding: 28px;
      text-align: center;
      background: var(--yellow);
      border: 3px solid var(--ink);
    }
    .connected-title {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 20px;
      font-weight: 900;
      line-height: 1.1;
    }
    .checkmark {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 3px solid var(--ink);
      background: #ffffff;
      font-size: 16px;
      font-weight: 900;
      line-height: 1;
    }
    .connected-address {
      margin-top: 12px;
      font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 800;
      overflow-wrap: anywhere;
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
    @keyframes qrFrameRefresh {
      0% { box-shadow: inset 0 0 0 0 var(--yellow); }
      35% { box-shadow: inset 0 0 0 10px var(--yellow); }
      100% { box-shadow: inset 0 0 0 0 var(--yellow); }
    }
    @keyframes qrImageRefresh {
      0% { opacity: 0.35; transform: translateY(8px) scale(0.975); }
      45% { opacity: 1; transform: translateY(0) scale(1.018); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .qr-wrap.refreshed,
      .qr-wrap.refreshed img {
        animation: none;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand" aria-label="WalletChan RPC">
      <img src="/assets/walletchan-icon.png" alt="" width="24" height="24">
      <span>WalletChan RPC</span>
    </div>
    <main>
      <h1 id="title">Wallet Pairing</h1>
      <p id="status" class="status">Loading pairing state...</p>
      <div id="qrWrap" class="qr-wrap">
        <img id="qr" alt="Wallet pairing QR code">
        <div id="connected" class="connected">
          <div class="connected-title">
            <span class="checkmark" aria-hidden="true">✓</span>
            <span>Wallet connected</span>
          </div>
          <div id="connectedAddress" class="connected-address"></div>
        </div>
      </div>
      <textarea id="uri" readonly aria-label="Wallet pairing URI"></textarea>
      <button id="copy" type="button">Copy URI</button>
      <button id="fresh" class="secondary" type="button">New Wallet URI</button>
      <p id="hint" class="hint">Scan this QR from your wallet app, or copy and paste the URI.</p>
    </main>
  </div>
  <script id="initial-state" type="application/json" nonce="${nonce}">${initialJson}</script>
  <script nonce="${nonce}">
    const stateEl = document.getElementById("initial-state");
    const titleEl = document.getElementById("title");
    const statusEl = document.getElementById("status");
    const qrWrapEl = document.getElementById("qrWrap");
    const qrEl = document.getElementById("qr");
    const connectedEl = document.getElementById("connected");
    const connectedAddressEl = document.getElementById("connectedAddress");
    const uriEl = document.getElementById("uri");
    const copyEl = document.getElementById("copy");
    const freshEl = document.getElementById("fresh");
    let currentUri = "";
    let currentQrKey = "";
    let refreshAnimationTimer = 0;

    function render(state) {
      const connected = state && state.connected === true;
      const label = state && typeof state.pairingLabel === "string" ? state.pairingLabel : "wallet";
      const uri = !connected && typeof state.pairingUri === "string" ? state.pairingUri : "";
      const account = connected ? firstAccount(state) : "";
      currentUri = uri;
      titleEl.textContent = label + " Pairing";
      statusEl.textContent = state && typeof state.message === "string"
        ? state.message
        : connected
          ? "A wallet is connected to WalletChan RPC."
          : "Waiting for a " + label + " URI.";
      statusEl.className = state && state.error ? "status error" : "status";
      qrEl.style.display = uri && state.qrDataUrl ? "block" : "none";
      connectedEl.style.display = connected ? "block" : "none";
      connectedAddressEl.textContent = account ? truncateAddress(account) : "";
      connectedAddressEl.style.display = account ? "block" : "none";
      if (uri && state.qrDataUrl) {
        const nextQrKey = uri + "|" + state.qrDataUrl;
        const shouldAnimateQr = currentQrKey && nextQrKey !== currentQrKey;
        qrEl.src = state.qrDataUrl;
        currentQrKey = nextQrKey;
        if (shouldAnimateQr) animateQrRefresh();
      } else {
        currentQrKey = "";
      }
      uriEl.value = uri;
      uriEl.style.display = connected ? "none" : "block";
      copyEl.disabled = !uri;
      copyEl.style.display = connected ? "none" : "block";
      copyEl.textContent = uri ? "Copy URI" : connected ? "Connected" : "Waiting";
      freshEl.disabled = false;
    }

    function firstAccount(state) {
      return state && Array.isArray(state.accounts) && typeof state.accounts[0] === "string"
        ? state.accounts[0]
        : "";
    }

    function truncateAddress(address) {
      return address.length > 14
        ? address.slice(0, 6) + "..." + address.slice(-4)
        : address;
    }

    function animateQrRefresh() {
      window.clearTimeout(refreshAnimationTimer);
      qrWrapEl.classList.remove("refreshed");
      void qrWrapEl.offsetWidth;
      qrWrapEl.classList.add("refreshed");
      refreshAnimationTimer = window.setTimeout(() => {
        qrWrapEl.classList.remove("refreshed");
      }, 560);
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
      statusEl.textContent = "Generating a fresh wallet URI...";
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

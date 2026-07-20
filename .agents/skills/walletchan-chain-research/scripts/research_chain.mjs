#!/usr/bin/env node
import { createRequire } from "node:module";
import { extname } from "node:path";
import { writeFile } from "node:fs/promises";

const DEFAULT_DELEGATE = "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";
const BRIDGE_CHAINS_URL = "https://walletchan.eth.sh/api/bridge/chains";
const ZEROX_DOCS_MD = "https://docs.0x.org/docs/introduction/supported-chains.md";
const COINGECKO_PLATFORMS = "https://api.coingecko.com/api/v3/asset_platforms";
const GECKOTERMINAL_NETWORKS = "https://api.geckoterminal.com/api/v2/networks";
const CHAINID_NETWORK = "https://chainid.network/chains.json";
const SAFE_CONFIG_CHAINS = "https://safe-config.safe.global/api/v1/chains/?limit=100";
const WALLETCHAN_SAFE_NON_EVM_CHAIN_IDS = new Set([324]);

function usage() {
  console.error(`Usage:
  node research_chain.mjs --chain-id <id> [--name <name>] [--rpc <url>] [--testnet-rpc <url> ...] [--icon-out <path>]

Examples:
  node research_chain.mjs --chain-id 4663 --name "Robinhood Chain" --rpc https://rpc.mainnet.chain.robinhood.com --testnet-rpc https://rpc.testnet.chain.robinhood.com
  node research_chain.mjs --chain-id 4663 --icon-out apps/extension/public/chainIcons/robinhood.webp`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      if (key === "testnet-rpc") {
        args[key] = [...(args[key] || []), next];
      } else {
        args[key] = next;
      }
      i += 1;
    }
  }
  return args;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function parse0xSwapTable(markdown) {
  const heading = /^## Swap and Gasless APIs\s*$/m;
  const headingMatch = heading.exec(markdown);
  if (!headingMatch) {
    throw new Error('0x docs no longer contain the "Swap and Gasless APIs" section');
  }

  const afterHeading = markdown.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingIndex = afterHeading.search(/^##\s+/m);
  const section = nextHeadingIndex === -1
    ? afterHeading
    : afterHeading.slice(0, nextHeadingIndex);
  const entries = [];

  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;

    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim().replace(/\*\*|`/g, ""));
    if (cells.length < 4 || cells[0] === "Chain" || /^-+$/.test(cells[0])) continue;

    const parsedChainId = Number(cells[1].replace(/,/g, ""));
    if (!Number.isInteger(parsedChainId) || parsedChainId <= 0) continue;
    entries.push({
      chain: cells[0],
      chainId: parsedChainId,
      swapApiSupported: cells[2].includes("✅"),
      gaslessApiSupported: cells[3].includes("✅"),
      evidence: trimmed,
    });
  }

  if (entries.length === 0) {
    throw new Error("0x Swap API table was found but no chain rows could be parsed");
  }
  return entries;
}

function parseBridgePayload(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.result)) return json.result;
  if (Array.isArray(json?.result?.chains)) return json.result.chains;
  if (Array.isArray(json?.chains)) return json.chains;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), ...options });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function checkRpc(rpcUrl) {
  if (!rpcUrl) return null;
  const [chainIdHex, delegateCode] = await Promise.all([
    rpcCall(rpcUrl, "eth_chainId", []),
    rpcCall(rpcUrl, "eth_getCode", [DEFAULT_DELEGATE, "latest"]),
  ]);
  return {
    chainIdHex,
    chainId: Number(BigInt(chainIdHex)),
    defaultDelegate: DEFAULT_DELEGATE,
    defaultDelegateHasCode: Boolean(delegateCode && delegateCode !== "0x"),
    defaultDelegateCodeBytes:
      delegateCode && delegateCode !== "0x" ? (delegateCode.length - 2) / 2 : 0,
  };
}

async function checkTestnetRpc(rpcUrl) {
  const chainIdHex = await rpcCall(rpcUrl, "eth_chainId", []);
  return {
    rpcUrl,
    chainIdHex,
    chainId: Number(BigInt(chainIdHex)),
  };
}

async function checkBridge(chainId) {
  const json = await fetchJson(BRIDGE_CHAINS_URL);
  const chains = parseBridgePayload(json);
  const chain = chains.find((item) => Number(item.chainId) === chainId);
  if (!chain) return null;
  return {
    chainId: chain.chainId,
    name: chain.name,
    icon: chain.icon,
    sendingEnabled: chain.sendingEnabled,
    receivingEnabled: chain.receivingEnabled,
    currency: chain.currency,
    explorers: chain.explorers,
    dexes: chain.dexes,
    bridges: chain.bridges,
  };
}

function isOfficialSafeTransactionService(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "api.safe.global" &&
      /^\/tx-service\/[a-z0-9-]+\/?$/.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

async function checkSafe(chainId) {
  const json = await fetchJson(SAFE_CONFIG_CHAINS);
  const chains = Array.isArray(json?.results) ? json.results : [];
  const entry = chains.find((item) => Number(item?.chainId) === chainId) || null;
  const transactionServiceOfficial = isOfficialSafeTransactionService(
    entry?.transactionService,
  );
  const excludedAsNonEvm = WALLETCHAN_SAFE_NON_EVM_CHAIN_IDS.has(chainId);
  const walletchanSafeAccountsSupported = Boolean(entry) &&
    transactionServiceOfficial &&
    !excludedAsNonEvm;

  return {
    configUrl: SAFE_CONFIG_CHAINS,
    supportedNetworksDocs: "https://docs.safe.global/advanced/smart-account-supported-networks",
    multiChainDeploymentDocs: "https://docs.safe.global/advanced/smart-account-multi-chain-deployment",
    chainId,
    listedInSafeConfig: Boolean(entry),
    chainName: entry?.chainName || null,
    shortName: entry?.shortName || null,
    isTestnet: entry?.isTestnet ?? null,
    transactionService: entry?.transactionService || null,
    transactionServiceOfficial,
    recommendedMasterCopyVersion: entry?.recommendedMasterCopyVersion || null,
    excludedAsNonEvm,
    walletchanSafeAccountsSupported,
    note: !entry
      ? "Exact chain ID is absent from Safe Config; treat Safe accounts as unsupported."
      : excludedAsNonEvm
        ? "Safe Config lists this chain, but WalletChan excludes its documented non-EVM Safe deployment."
        : transactionServiceOfficial
          ? "Exact chain ID and official Safe Transaction Service are present; still review the linked Safe docs for new EVM-compatibility exceptions."
          : "Safe Config entry does not expose an accepted official Transaction Service; treat Safe accounts as unsupported.",
  };
}

async function check0x(chainId) {
  const res = await fetch(ZEROX_DOCS_MD, { signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const entries = parse0xSwapTable(text);
  const entry = entries.find((item) => item.chainId === chainId) || null;
  return {
    docsUrl: "https://docs.0x.org/docs/introduction/supported-chains",
    section: "Swap and Gasless APIs",
    chain: entry?.chain || null,
    chainId,
    listedInSwapTable: Boolean(entry),
    swapApiSupported: entry?.swapApiSupported === true,
    gaslessApiSupported: entry?.gaslessApiSupported === true,
    evidence: entry?.evidence || null,
    verifiedChainCount: entries.filter((item) => item.swapApiSupported).length,
    note: entry
      ? "Support is taken only from this exact table row and the Swap API column."
      : "Chain ID is absent from the Swap and Gasless APIs table; treat swap support as false.",
  };
}

async function checkCoinGecko(chainId, name) {
  const platforms = await fetchJson(COINGECKO_PLATFORMS);
  const query = normalizeName(name);
  const hits = platforms.filter((item) => {
    const idMatch = Number(item.chain_identifier) === chainId;
    const nameMatch = query && normalizeName(`${item.id} ${item.name} ${item.shortname}`).includes(query.replace(/\s+chain$/, ""));
    return idMatch || nameMatch;
  });
  return hits.map((item) => ({
    id: item.id,
    chain_identifier: item.chain_identifier,
    name: item.name,
    shortname: item.shortname,
    native_coin_id: item.native_coin_id,
    image: item.image,
  }));
}

async function checkGeckoTerminal(chainId, name, coingeckoPlatformId) {
  const query = normalizeName(name);
  const hits = [];
  for (let page = 1; page <= 5; page += 1) {
    const json = await fetchJson(`${GECKOTERMINAL_NETWORKS}?page=${page}`);
    for (const item of json.data || []) {
      const attrs = item.attributes || {};
      const haystack = normalizeName(`${item.id} ${attrs.name} ${attrs.coingecko_asset_platform_id}`);
      if (
        (coingeckoPlatformId && attrs.coingecko_asset_platform_id === coingeckoPlatformId) ||
        (query && haystack.includes(query.replace(/\s+chain$/, ""))) ||
        haystack.includes(String(chainId))
      ) {
        hits.push({ id: item.id, name: attrs.name, coingecko_asset_platform_id: attrs.coingecko_asset_platform_id });
      }
    }
    if (!json.links?.next) break;
  }
  return hits;
}

async function checkChainIdNetwork(chainId) {
  const chains = await fetchJson(CHAINID_NETWORK);
  const chain = chains.find((item) => Number(item.chainId) === chainId);
  if (!chain) return null;
  return {
    name: chain.name,
    chain: chain.chain,
    chainId: chain.chainId,
    nativeCurrency: chain.nativeCurrency,
    rpc: chain.rpc,
    explorers: chain.explorers,
  };
}

function checkMetamaskDeployments(chainId) {
  const candidates = [
    `${process.cwd().replace(/\/$/, "")}/package.json`,
    `${process.cwd().replace(/\/$/, "")}/apps/extension/package.json`,
  ];
  const errors = [];

  for (const candidate of candidates) {
    try {
      const require = createRequire(candidate);
      const { DELEGATOR_CONTRACTS } = require("@metamask/delegation-deployments");
      return Object.fromEntries(
        Object.entries(DELEGATOR_CONTRACTS || {}).map(([version, chains]) => [
          version,
          Boolean(chains?.[String(chainId)]),
        ]),
      );
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }

  try {
    const { DELEGATOR_CONTRACTS } = require("@metamask/delegation-deployments");
    return Object.fromEntries(
      Object.entries(DELEGATOR_CONTRACTS || {}).map(([version, chains]) => [
        version,
        Boolean(chains?.[String(chainId)]),
      ]),
    );
  } catch (error) {
    errors.push(`global require: ${error.message}`);
    return { unavailable: errors.join("\n") };
  }
}

function iconExtension(contentType, url, requestedPath) {
  const existing = extname(requestedPath || "");
  if (existing) return existing;
  if (/webp/i.test(contentType)) return ".webp";
  if (/svg/i.test(contentType)) return ".svg";
  if (/png/i.test(contentType)) return ".png";
  if (/jpe?g/i.test(contentType)) return ".jpg";
  const urlExt = extname(new URL(url).pathname);
  return urlExt || ".img";
}

async function downloadIcon(url, outPath) {
  if (!url || !outPath) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Icon download failed: ${res.status} ${res.statusText}`);
  const contentType = res.headers.get("content-type") || "";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = iconExtension(contentType, url, outPath);
  const finalPath = extname(outPath) ? outPath : `${outPath}${ext}`;
  await writeFile(finalPath, bytes);
  return { path: finalPath, bytes: bytes.length, contentType };
}

const args = parseArgs(process.argv.slice(2));
const chainId = Number(args["chain-id"]);
if (!Number.isInteger(chainId) || chainId <= 0) {
  usage();
  process.exit(2);
}

const name = args.name || "";
const rpcUrl = args.rpc || "";
const testnetRpcUrls = Array.isArray(args["testnet-rpc"])
  ? args["testnet-rpc"]
  : [];

const report = {
  input: { chainId, name, rpcUrl, testnetRpcUrls },
  checkedAt: new Date().toISOString(),
  rpc: null,
  testnets: [],
  bridge: null,
  safe: null,
  zerox: null,
  coinGecko: [],
  geckoTerminal: [],
  chainidNetwork: null,
  metamaskDelegationDeployments: null,
  iconDownload: null,
  errors: [],
};

for (const [key, task] of [
  ["rpc", () => checkRpc(rpcUrl)],
  ["bridge", () => checkBridge(chainId)],
  ["safe", () => checkSafe(chainId)],
  ["zerox", () => check0x(chainId)],
  ["coinGecko", () => checkCoinGecko(chainId, name)],
  ["chainidNetwork", () => checkChainIdNetwork(chainId)],
]) {
  try {
    report[key] = await task();
  } catch (error) {
    report.errors.push({ source: key, error: error.message });
  }
}

try {
  const platformId = report.coinGecko?.[0]?.id;
  report.geckoTerminal = await checkGeckoTerminal(chainId, name, platformId);
} catch (error) {
  report.errors.push({ source: "geckoTerminal", error: error.message });
}

report.metamaskDelegationDeployments = checkMetamaskDeployments(chainId);

for (const testnetRpcUrl of testnetRpcUrls) {
  try {
    report.testnets.push(await checkTestnetRpc(testnetRpcUrl));
  } catch (error) {
    report.errors.push({
      source: `testnetRpc:${testnetRpcUrl}`,
      error: error.message,
    });
  }
}

if (args["icon-out"]) {
  const iconUrl =
    report.bridge?.icon ||
    report.coinGecko?.[0]?.image?.large ||
    report.coinGecko?.[0]?.image?.small ||
    report.coinGecko?.[0]?.image?.thumb;
  try {
    report.iconDownload = await downloadIcon(iconUrl, args["icon-out"]);
  } catch (error) {
    report.errors.push({ source: "iconDownload", error: error.message });
  }
}

console.log(JSON.stringify(report, null, 2));

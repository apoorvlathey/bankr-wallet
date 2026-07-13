import { useState, useEffect, useRef } from "react";
import { getStoredRpcUrl } from "@/lib/chains";
import { secureHttpTransport } from "@/chrome/network/rpcClient";

/**
 * What kind of account lives at a recipient address.
 *
 *   eoa       — no code (regular externally-owned account)
 *   delegated — EIP-7702: code starts with the 0xef0100 delegation prefix, so
 *               the account is still controlled by its private key (safe to
 *               send tokens to).
 *   contract  — arbitrary deployed bytecode. Tokens sent here may be stuck
 *               unless the contract knows how to recover them.
 */
export type RecipientKind = "eoa" | "delegated" | "contract";

/** EIP-7702 delegation designator prefix (0xef0100 + 20-byte target). */
const EIP_7702_PREFIX = "0xef0100";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const cache = new Map<string, RecipientKind>();
const cacheKey = (chainId: number, address: string) =>
  `${chainId}-${address.toLowerCase()}`;

function classifyCode(code: string): RecipientKind {
  const normalized = code.toLowerCase();
  if (!normalized || normalized === "0x") return "eoa";
  if (normalized.startsWith(EIP_7702_PREFIX)) return "delegated";
  return "contract";
}

interface Result {
  kind: RecipientKind | null;
  isChecking: boolean;
  error: string | null;
}

/**
 * Resolves whether `address` on `chainId` is an EOA, a 7702-delegated EOA, or
 * a real contract. Results are cached in memory for the popup session.
 */
export function useRecipientAddressKind(
  address: string | null | undefined,
  chainId: number | null | undefined,
): Result {
  const [kind, setKind] = useState<RecipientKind | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    const reqId = requestId.current;

    if (!address || !chainId || !ADDRESS_REGEX.test(address)) {
      setKind(null);
      setIsChecking(false);
      setError(null);
      return;
    }

    const key = cacheKey(chainId, address);
    const cached = cache.get(key);
    if (cached) {
      setKind(cached);
      setIsChecking(false);
      setError(null);
      return;
    }

    setKind(null);
    setIsChecking(true);
    setError(null);

    (async () => {
      try {
        const rpcUrl = await getStoredRpcUrl(chainId);
        if (!rpcUrl) {
          if (reqId !== requestId.current) return;
          setIsChecking(false);
          setError("No RPC configured for this chain");
          return;
        }

        const { createPublicClient } = await import("viem");
        const client = createPublicClient({
          transport: secureHttpTransport(rpcUrl, { timeout: 8000, retryCount: 1 }),
        });
        const code = await client.getCode({ address: address as `0x${string}` });
        const resolved = classifyCode(code ?? "0x");

        cache.set(key, resolved);
        if (reqId !== requestId.current) return;
        setKind(resolved);
        setIsChecking(false);
      } catch (err) {
        if (reqId !== requestId.current) return;
        setIsChecking(false);
        setError(err instanceof Error ? err.message : "Failed to check address");
      }
    })();
  }, [address, chainId]);

  return { kind, isChecking, error };
}

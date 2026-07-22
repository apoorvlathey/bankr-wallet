import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssetChangeRecord,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";
import { FLASHBLOCKS_CHAIN_IDS } from "@/constants/networks";
import {
  applyTokenDisplayMetadata,
  collectMissingTokenMetadataRequests,
  tokenDisplayMetadataKey,
  type TokenDisplayMetadata,
} from "./tokenMetadata";

interface NftDisplayMetadata {
  name?: string;
  collectionName?: string;
  symbol?: string;
  image?: string;
}

function applyNftDisplayMetadata(
  record: AssetChangeRecord | undefined,
  leg: "source" | "destination",
  metadata: Record<string, NftDisplayMetadata | null>,
): AssetChangeRecord | undefined {
  if (!record?.nftTransfers?.length) return record;
  return {
    ...record,
    nftTransfers: record.nftTransfers.map((transfer, index) => {
      const resolved = metadata[`${leg}:${index}`];
      return resolved
        ? {
            ...transfer,
            collectionName: resolved.collectionName,
            symbol: resolved.symbol,
            metadata: { name: resolved.name, image: resolved.image },
            metadataLoading: false,
          }
        : { ...transfer, metadataLoading: metadata[`${leg}:${index}`] === undefined };
    }),
  };
}

export function useAssetChangeData({
  isOpen,
  tx,
}: {
  isOpen: boolean;
  tx: CompletedTransaction;
}) {
    const reconciledReceiptRef = useRef<string | null>(null);
    // Source-chain native USD price for the Value + Transaction Fee rows.
    // Fetched lazily once the modal opens. Almost every recorded tx has a
    // non-zero gas fee, so we don't bother gating on value/fee here — the
    // single CoinGecko call covers both rows.
    const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null);
    useEffect(() => {
      if (!isOpen) return;
      chrome.runtime.sendMessage(
        { type: "fetchNativePrice", chainId: tx.chainId },
        (res) => {
          if (res?.success && typeof res.priceUsd === "number" && res.priceUsd > 0) {
            setNativePriceUsd(res.priceUsd);
          }
        },
      );
    }, [isOpen, tx.chainId]);

    const bridgeDestinationChainId = tx.bridge?.destinationChainId;

    const [assetTokenMetadata, setAssetTokenMetadata] = useState<
      Record<string, TokenDisplayMetadata>
    >({});
    const [nftMetadata, setNftMetadata] = useState<
      Record<string, NftDisplayMetadata | null>
    >({});
    const nftMetadataRef = useRef(nftMetadata);
    useEffect(() => {
      nftMetadataRef.current = nftMetadata;
    }, [nftMetadata]);
    useEffect(() => {
      nftMetadataRef.current = {};
      setNftMetadata({});
    }, [tx.id]);

    useEffect(() => {
      if (!isOpen) return;
      const requests: Array<{ leg: "source" | "destination"; index: number }> = [];
      for (let index = 0; index < (tx.assetChanges?.nftTransfers?.length ?? 0); index += 1) {
        requests.push({ leg: "source", index });
      }
      for (let index = 0; index < (tx.destAssetChanges?.nftTransfers?.length ?? 0); index += 1) {
        requests.push({ leg: "destination", index });
      }
      const pending = requests.filter(
        ({ leg, index }) => !(`${leg}:${index}` in nftMetadataRef.current),
      );
      if (pending.length === 0) return;
      let cancelled = false;
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < pending.length) {
          const request = pending[next++];
          const key = `${request.leg}:${request.index}`;
          const response = await new Promise<{ success?: boolean; data?: NftDisplayMetadata }>(
            (resolve) => chrome.runtime.sendMessage({
              type: "resolveHistoryNftMetadata",
              txId: tx.id,
              leg: request.leg,
              nftIndex: request.index,
            }, resolve),
          );
          if (!cancelled) {
            setNftMetadata((current) => ({
              ...current,
              [key]: response?.success ? response.data ?? null : null,
            }));
          }
        }
      };
      void Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
      return () => { cancelled = true; };
    }, [isOpen, tx.assetChanges, tx.destAssetChanges, tx.id]);

    useEffect(() => {
      if (!isOpen) return;
      const requests = new Map<
        string,
        { chainId: number; tokenAddress: string }
      >();
      collectMissingTokenMetadataRequests(
        tx.assetChanges,
        tx.chainId,
        requests,
      );
      const feeToken = tx.erc20FeePayment?.token;
      if (feeToken && /^0x[a-fA-F0-9]{40}$/.test(feeToken)) {
        const tokenAddress = feeToken.toLowerCase();
        requests.set(tokenDisplayMetadataKey(tx.chainId, tokenAddress), {
          chainId: tx.chainId,
          tokenAddress,
        });
      }
      if (bridgeDestinationChainId && tx.destAssetChanges) {
        collectMissingTokenMetadataRequests(
          tx.destAssetChanges,
          bridgeDestinationChainId,
          requests,
        );
      }
      if (requests.size === 0) return;

      let cancelled = false;
      Promise.all(
        Array.from(requests.entries()).map(
          ([key, req]) =>
            new Promise<{
              key: string;
              metadata: TokenDisplayMetadata | null;
            }>((resolve) => {
              chrome.runtime.sendMessage(
                {
                  type: "resolveTokenMetadata",
                  chainId: req.chainId,
                  tokenAddress: req.tokenAddress,
                },
                (response) => {
                  resolve({
                    key,
                    metadata: response?.success ? response.data ?? null : null,
                  });
                },
              );
            }),
        ),
      ).then((results) => {
        if (cancelled) return;
        const found = results.filter(
          (result): result is {
            key: string;
            metadata: TokenDisplayMetadata;
          } => result.metadata !== null,
        );
        if (found.length === 0) return;
        setAssetTokenMetadata((prev) => {
          const next = { ...prev };
          for (const { key, metadata } of found) {
            const existing = next[key] ?? {};
            next[key] = {
              symbol: existing.symbol ?? metadata.symbol,
              decimals: existing.decimals ?? metadata.decimals,
              logoUrl: existing.logoUrl ?? metadata.logoUrl,
            };
          }
          return next;
        });
      });

      return () => {
        cancelled = true;
      };
    }, [
      isOpen,
      tx.assetChanges,
      tx.erc20FeePayment?.token,
      bridgeDestinationChainId,
      tx.chainId,
      tx.destAssetChanges,
    ]);

    const sourceAssetChanges = useMemo(
      () => applyNftDisplayMetadata(
        applyTokenDisplayMetadata(
          tx.assetChanges,
          tx.chainId,
          assetTokenMetadata,
        ),
        "source",
        nftMetadata,
      ),
      [assetTokenMetadata, nftMetadata, tx.assetChanges, tx.chainId],
    );
    const destinationAssetChanges = useMemo(
      () => applyNftDisplayMetadata(
        applyTokenDisplayMetadata(
          tx.destAssetChanges,
          bridgeDestinationChainId ?? tx.chainId,
          assetTokenMetadata,
        ),
        "destination",
        nftMetadata,
      ),
      [
        assetTokenMetadata,
        nftMetadata,
        bridgeDestinationChainId,
        tx.chainId,
        tx.destAssetChanges,
      ],
    );

    useEffect(() => {
      if (!isOpen) return;
      const repairableStatus = tx.status === "success" ||
        (tx.status === "failed" && !!tx.erc20FeePayment);
      if (!repairableStatus || !tx.txHash) return;
      if (
        tx.assetChanges?.version === 2 &&
        (!tx.erc20FeePayment || !!tx.erc20FeePayment.amountWei) &&
        !FLASHBLOCKS_CHAIN_IDS.has(tx.chainId)
      ) {
        return;
      }
      const receiptKey = `${tx.id}:${tx.txHash}`;
      if (reconciledReceiptRef.current === receiptKey) return;
      reconciledReceiptRef.current = receiptKey;
      chrome.runtime.sendMessage({
        type: "backfillAssetChanges",
        txId: tx.id,
      });
    }, [
      isOpen,
      tx.id,
      tx.status,
      tx.txHash,
      tx.assetChanges,
      tx.chainId,
      tx.erc20FeePayment,
    ]);

    // USD prices keyed by `${chainId}-${address-lowercase}` for ERC-20s and
    // `${chainId}-native` for native deltas. Populated lazily from assetChanges
    // + destAssetChanges + bridge dest chain native so the Token Changes rows
    // and Source / Destination cards can show a USD subtitle. Uses the same
    // backend chain as the rest of the wallet — proxy `fetchTokenPrice` (which
    // already short-circuits via portfolio API + CoinGecko fallback) for ERC-20s
    // and `fetchNativePrice` for native; results are cached at the background
    // layer so re-opens are free.
    const [tokenPricesUsd, setTokenPricesUsd] = useState<Record<string, number>>({});
    useEffect(() => {
      if (!isOpen) return;
      const requests: Array<{ key: string; chainId: number; address: string | "native" }> = [];
      const seen = new Set<string>();
      const addReq = (chainId: number, address: string | "native") => {
        const addrLower = address === "native" ? "native" : address.toLowerCase();
        const key = `${chainId}-${addrLower}`;
        if (seen.has(key)) return;
        seen.add(key);
        requests.push({ key, chainId, address: addrLower });
      };
      const collect = (record: AssetChangeRecord | undefined, chainId: number) => {
        if (!record) return;
        if (record.nativeDelta) addReq(chainId, "native");
        for (const t of record.erc20Transfers) addReq(chainId, t.token);
      };
      collect(sourceAssetChanges, tx.chainId);
      if (tx.erc20FeePayment?.token) {
        addReq(tx.chainId, tx.erc20FeePayment.token);
      }
      if (bridgeDestinationChainId && destinationAssetChanges) {
        collect(destinationAssetChanges, bridgeDestinationChainId);
      }
      if (requests.length === 0) return;
      let cancelled = false;
      Promise.all(
        requests.map(
          (req) =>
            new Promise<{ key: string; priceUsd: number }>((resolve) => {
              const msg =
                req.address === "native"
                  ? { type: "fetchNativePrice", chainId: req.chainId }
                  : { type: "fetchTokenPrice", chainId: req.chainId, address: req.address };
              chrome.runtime.sendMessage(msg, (res) => {
                const price = res?.success ? Number(res.priceUsd ?? 0) : 0;
                resolve({ key: req.key, priceUsd: price > 0 ? price : 0 });
              });
            }),
        ),
      ).then((results) => {
        if (cancelled) return;
        setTokenPricesUsd((prev) => {
          const next = { ...prev };
          for (const { key, priceUsd } of results) {
            if (priceUsd > 0) next[key] = priceUsd;
          }
          return next;
        });
      });
      return () => {
        cancelled = true;
      };
    }, [
      isOpen,
      tx.chainId,
      tx.erc20FeePayment?.token,
      sourceAssetChanges,
      destinationAssetChanges,
      bridgeDestinationChainId,
    ]);

    /**
     * Format a (possibly signed) base-units token amount as `$N.NN` using the
     * price map. Returns null when the price is unknown or the USD result
     * rounds to zero.
     */
    const formatTokenAmountUsd = useCallback(
      (
        amountWei: string,
        decimals: number,
        chainId: number,
        addressOrNative: string | "native",
      ): string | null => {
        const key = `${chainId}-${addressOrNative === "native" ? "native" : addressOrNative.toLowerCase()}`;
        const price = tokenPricesUsd[key];
        if (!price || price <= 0) return null;
        let bi: bigint;
        try {
          bi = BigInt(amountWei);
        } catch {
          return null;
        }
        if (bi < 0n) bi = -bi;
        if (bi === 0n) return null;
        const divisor = 10n ** BigInt(decimals);
        const whole = Number(bi / divisor);
        const frac = Number(bi % divisor) / Number(divisor);
        const usd = (whole + frac) * price;
        if (usd <= 0) return null;
        return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
      },
      [tokenPricesUsd],
    );

    // Format a wei-amount as `$N.NN`, returning null when the price is missing
    // or the wei amount is zero. Used by both the Value and Transaction Fee
    // rows to render the inline USD equivalent.
    const formatWeiUsd = useCallback(
      (raw: string | undefined | null): string | null => {
        if (!raw || !nativePriceUsd || nativePriceUsd <= 0) return null;
        try {
          const wei = BigInt(raw);
          if (wei === 0n) return null;
          const usd = (Number(wei) / 1e18) * nativePriceUsd;
          if (usd <= 0) return null;
          return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
        } catch {
          return null;
        }
      },
      [nativePriceUsd],
    );

    const feeTokenMetadata = tx.erc20FeePayment
      ? assetTokenMetadata[
          tokenDisplayMetadataKey(tx.chainId, tx.erc20FeePayment.token)
        ]
      : undefined;
    const feeTokenUsd =
      tx.erc20FeePayment?.amountWei &&
      feeTokenMetadata?.decimals !== undefined
        ? formatTokenAmountUsd(
            tx.erc20FeePayment.amountWei,
            feeTokenMetadata.decimals,
            tx.chainId,
            tx.erc20FeePayment.token,
          )
        : null;

  return {
    sourceAssetChanges,
    destinationAssetChanges,
    formatTokenAmountUsd,
    formatWeiUsd,
    feeTokenMetadata,
    feeTokenUsd,
  };
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  getPortfolioTokenKey,
  unhidePortfolioToken,
} from "@/chrome/portfolio/hiddenTokens";
import AddTokenChainPicker from "@/components/AddTokenChainPicker";
import AddTokenScreen from "@/components/AddTokenScreen";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainByName, getVisibleChains } from "@/lib/chains";

interface AddTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenAdded: (options?: { forceSnapshot?: boolean }) => void | Promise<void>;
  existingTokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

async function sendCustomTokenWrite(
  message: Record<string, unknown>,
): Promise<void> {
  const response = await new Promise<{ success: boolean; error?: string }>(
    (resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    },
  );
  if (!response?.success) {
    throw new Error(response?.error || "Failed to save token");
  }
}

export default function AddTokenModal({
  isOpen,
  onClose,
  onTokenAdded,
  existingTokenKeys,
  allTokenKeys,
  hiddenTokenKeys,
}: AddTokenModalProps) {
  const { networksInfo } = useNetworks();
  const chainList = useMemo(() => getVisibleChains(networksInfo), [networksInfo]);

  const [selectedChainId, setSelectedChainId] = useState(
    chainList[0]?.chainId ?? 8453,
  );
  const [tokenAddress, setTokenAddress] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isChoosingChain, setIsChoosingChain] = useState(false);
  const [chainSearch, setChainSearch] = useState("");
  const fetchCounterRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const tokenKey = getPortfolioTokenKey(selectedChainId, tokenAddress);
  const isHiddenToken = fetched && hiddenTokenKeys.has(tokenKey);
  const isDuplicate =
    fetched && !isHiddenToken && existingTokenKeys.has(tokenKey);

  useEffect(() => {
    if (!isOpen) {
      setTokenAddress("");
      setName("");
      setSymbol("");
      setDecimals("");
      setLoading(false);
      setError(null);
      setFetched(false);
      setSaving(false);
      setIsChoosingChain(false);
      setChainSearch("");
      return;
    }

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      returnFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    chrome.storage.sync.get("chainName").then(({ chainName }) => {
      if (cancelled) return;
      const activeChain = getResolvedChainByName(chainName, networksInfo);
      const fallback = chainList[0]?.chainId ?? 8453;
      const targetId =
        activeChain && chainList.some((chain) => chain.chainId === activeChain.chainId)
          ? activeChain.chainId
          : fallback;
      setSelectedChainId(targetId);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, networksInfo, chainList]);

  const fetchTokenInfo = useCallback(
    async (address: string, chainId: number) => {
      if (!ADDRESS_REGEX.test(address)) return;

      const counter = ++fetchCounterRef.current;
      setLoading(true);
      setError(null);
      setFetched(false);
      setName("");
      setSymbol("");
      setDecimals("");

      try {
        const result = await new Promise<{
          success: boolean;
          data?: { name: string; symbol: string; decimals: number };
        }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "fetchTokenInfo", tokenAddress: address, chainId },
            resolve,
          );
        });

        if (counter !== fetchCounterRef.current) return;
        if (!result.success || !result.data) {
          setError("Not a valid ERC-20 contract on this chain");
          setLoading(false);
          return;
        }

        setName(result.data.name);
        setSymbol(result.data.symbol);
        setDecimals(String(result.data.decimals));
        setFetched(true);
      } catch {
        if (counter !== fetchCounterRef.current) return;
        setError("Failed to fetch token info");
      } finally {
        if (counter === fetchCounterRef.current) setLoading(false);
      }
    },
    [],
  );

  const handleAddressChange = (value: string) => {
    setTokenAddress(value);
    setError(null);
    setFetched(false);
    if (ADDRESS_REGEX.test(value)) {
      void fetchTokenInfo(value, selectedChainId);
    }
  };

  const handleChainChange = (chainId: number) => {
    setSelectedChainId(chainId);
    setIsChoosingChain(false);
    setChainSearch("");
    if (ADDRESS_REGEX.test(tokenAddress)) {
      void fetchTokenInfo(tokenAddress, chainId);
    }
  };

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!fetched || isDuplicate || !symbol || !decimals) return;
    setSaving(true);
    try {
      if (isHiddenToken) {
        await unhidePortfolioToken(selectedChainId, tokenAddress);
      }

      if (!isHiddenToken || !allTokenKeys.has(tokenKey)) {
        await sendCustomTokenWrite({
          type: "addCustomToken",
          contractAddress: tokenAddress,
          chainId: selectedChainId,
          symbol,
          name,
          decimals: parseInt(decimals, 10),
        });
      }

      await onTokenAdded({ forceSnapshot: true });
      onClose();
    } catch {
      setError("Failed to save token");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const selectedChain = chainList.find(
    (chain) => chain.chainId === selectedChainId,
  );
  const explorerUrl = selectedChain?.explorer
    ? `${selectedChain.explorer.replace(/\/+$/, "")}/address/${tokenAddress}`
    : null;
  const canSave =
    fetched && !isDuplicate && !loading && !saving && !!symbol && !!decimals;

  return (
    <FullScreenPickerLayer>
      {isChoosingChain ? (
        <AddTokenChainPicker
          chains={chainList}
          selectedChainId={selectedChainId}
          search={chainSearch}
          onSearchChange={setChainSearch}
          onBack={() => {
            setIsChoosingChain(false);
            setChainSearch("");
          }}
          onSelect={handleChainChange}
        />
      ) : (
        <AddTokenScreen
          headingRef={headingRef}
          selectedChain={selectedChain}
          selectedChainId={selectedChainId}
          tokenAddress={tokenAddress}
          name={name}
          symbol={symbol}
          decimals={decimals}
          loading={loading}
          saving={saving}
          fetched={fetched}
          error={error}
          isDuplicate={isDuplicate}
          isHiddenToken={isHiddenToken}
          explorerUrl={explorerUrl}
          canSave={canSave}
          saveLabel={isHiddenToken ? "Add back" : "Add token"}
          onBack={onClose}
          onChooseChain={() => setIsChoosingChain(true)}
          onAddressChange={handleAddressChange}
          onNameChange={setName}
          onSymbolChange={setSymbol}
          onDecimalsChange={setDecimals}
          onSubmit={handleSave}
        />
      )}
    </FullScreenPickerLayer>
  );
}

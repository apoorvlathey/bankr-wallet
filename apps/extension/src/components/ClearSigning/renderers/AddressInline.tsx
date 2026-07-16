import { useEffect, useState } from "react";

import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { getChainConfig } from "@/constants/chainConfig";
import { getEthShLabels } from "@/lib/ethShLabelsCache";

export function AddressInline({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}) {
  const [externalLabel, setExternalLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setExternalLabel(null);
    void getEthShLabels(address, chainId).then((labels) => {
      if (!cancelled) setExternalLabel(labels[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return (
    <LabeledAddressPopover
      address={address}
      contextLabel="decoded address"
      explorer={getChainConfig(chainId).explorer}
      label={externalLabel || `${address.slice(0, 6)}...${address.slice(-4)}`}
      maxW="200px"
    />
  );
}

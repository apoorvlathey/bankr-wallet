import { useEffect, useState } from "react";

import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { getChainConfig } from "@/constants/chainConfig";
import { getEthShLabels } from "@/lib/ethShLabelsCache";

interface AddressParamProps {
  value: string;
  chainId: number;
  contextLabel?: string;
}

export function AddressParam({
  value,
  chainId,
  contextLabel = "decoded parameter address",
}: AddressParamProps) {
  const address = value?.toLowerCase().startsWith("0x") ? value : `0x${value}`;
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLabel(null);
    void getEthShLabels(address, chainId).then((labels) => {
      if (!cancelled) setLabel(labels[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return (
    <LabeledAddressPopover
      address={address}
      contextLabel={contextLabel}
      explorer={getChainConfig(chainId).explorer}
      label={label || `${address.slice(0, 8)}...${address.slice(-6)}`}
      maxW="200px"
    />
  );
}

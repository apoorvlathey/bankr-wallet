import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { resolveAddressToName } from "@/lib/ensUtils";
import { findAddressContact } from "../contactBook/repository";

export interface CounterpartyLabels {
  label?: string;
  ens?: string;
}

/** Best-effort eth.sh and reverse-name resolution; neither source is required. */
export async function resolveCounterpartyLabels(
  address: string,
  chainId: number,
): Promise<CounterpartyLabels> {
  const contact = await findAddressContact(address);
  if (contact) return { label: contact.label };
  const [labels, ens] = await Promise.all([
    getEthShLabels(address, chainId).catch(() => [] as string[]),
    resolveAddressToName(address).catch(() => null),
  ]);
  return { label: labels[0], ens: ens || undefined };
}

import { fetchOnchainBalances } from "./onchainBalances";
import { recordSnapshot } from "./snapshotStorage";
import { loadPortfolioTokenCatalog } from "./tokenCatalog";

export async function recordCurrentPortfolioSnapshot(
  address: string,
): Promise<void> {
  const catalog = await loadPortfolioTokenCatalog(address);
  let totalValueUsd = catalog.totalValueUsd;

  try {
    const onchain = await fetchOnchainBalances(address, catalog.tokens);
    const defiTotal = (catalog.defiPositions || []).reduce(
      (sum, position) => sum + position.valueUsd,
      0,
    );
    totalValueUsd = onchain.totalValueUsd + defiTotal;
  } catch {
    // Keep the catalog/API total if RPC balance refresh is unavailable.
  }

  await recordSnapshot(address, totalValueUsd, { force: true });
}

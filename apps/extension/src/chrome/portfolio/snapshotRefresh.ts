import { recordSnapshot } from "./snapshotStorage";
import { loadPortfolioTokenCatalog } from "./tokenCatalog";

export async function recordCurrentPortfolioSnapshot(
  address: string,
): Promise<void> {
  const catalog = await loadPortfolioTokenCatalog(address, { enrich: false });
  await recordSnapshot(address, catalog.totalValueUsd, { force: true });
}

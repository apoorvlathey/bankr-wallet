import { getRpcUrl } from "../transactions/rpcConfig";
import { getTxById } from "../txHistoryStorage";

export async function markErc7715PermissionRevokedFromReceipt(
  txId: string,
): Promise<void> {
  try {
    const tx = await getTxById(txId);
    const grantId = tx?.erc7715PermissionRevokeMeta?.grantId;
    const accountId = tx?.accountId;
    if (!grantId || !accountId) return;
    const { revokeErc7715PermissionGrant } = await import(
      "../pendingErc7715PermissionStorage"
    );
    await revokeErc7715PermissionGrant({ grantId, accountId });
  } catch (error) {
    console.warn("[receipt] ERC-7715 grant local revoke sync failed", error);
  }
}

export async function syncDelegationMirrorFromChain(
  txId: string,
  chainId: number,
  rpcUrlOverride?: string,
): Promise<void> {
  try {
    const tx = await getTxById(txId);
    const accountId = tx?.accountId;
    const accountAddress = tx?.tx?.from;
    if (!tx?.delegation7702Meta || !accountId || !accountAddress) return;
    const rpcUrl = rpcUrlOverride ?? (await getRpcUrl(chainId));
    if (!rpcUrl) return;
    const [resolution, storage, registry] = await Promise.all([
      import("../../utils/delegationResolution"),
      import("../delegationStorage"),
      import("../../constants/chainRegistry"),
    ]);
    const read = await resolution.readOnchainDelegate(
      rpcUrl,
      chainId,
      accountAddress as `0x${string}`,
    );
    if (!read.ok) return;
    if (
      !read.delegate ||
      read.delegate.toLowerCase() ===
        registry.EIP_7702_DEFAULT_DELEGATE.toLowerCase()
    ) {
      await storage.removeCustomDelegate(accountId, chainId);
      return;
    }
    await storage.setCustomDelegate(accountId, chainId, read.delegate);
  } catch (error) {
    console.warn("[receipt] 7702 delegation mirror sync failed", error);
  }
}

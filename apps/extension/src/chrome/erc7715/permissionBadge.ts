export async function updateErc7715PermissionBadge(): Promise<void> {
  const { updateBadge } = await import("../requests/pendingTxStorage");
  await updateBadge();
}

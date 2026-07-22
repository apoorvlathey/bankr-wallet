export async function recordPrivacyTransactionDropped(
  txId: string,
  txHash: string,
): Promise<void> {
  try {
    const { recordPrivacyShieldDropped } = await import(
      "../privacy/operations/lifecycle"
    );
    await recordPrivacyShieldDropped(txId, txHash);
  } catch (error) {
    console.warn("[privacy-shield] dropped transaction mirror failed", error);
  }
  try {
    const { recordPrivacyRagequitDropped } = await import(
      "../privacy/ragequit/lifecycle"
    );
    await recordPrivacyRagequitDropped(txId, txHash);
  } catch (error) {
    console.warn("[privacy-ragequit] dropped transaction mirror failed", error);
  }
}

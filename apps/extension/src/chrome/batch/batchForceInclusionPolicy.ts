export type LocalBatchForceInclusionProcessor =
  typeof import("../forceInclusion/batch")["processForceInclusionBatchLocal"];

export type LocalBatchForceInclusionResolution =
  | { ok: true; processor: LocalBatchForceInclusionProcessor | null }
  | { ok: false; error: string };

/** Batch force inclusion is currently implemented only for OP Stack chains. */
export async function resolveLocalBatchForceInclusion(
  chainId: number,
  enabled: boolean,
): Promise<LocalBatchForceInclusionResolution> {
  if (!enabled) return { ok: true, processor: null };
  const { FORCE_INCLUSION_CHAINS } = await import("@/constants/chainRegistry");
  if (FORCE_INCLUSION_CHAINS.get(chainId)?.protocol !== "op-stack") {
    return {
      ok: false,
      error: "Arbitrum force inclusion is not available for batch requests",
    };
  }
  const { processForceInclusionBatchLocal } = await import(
    "../forceInclusion/batch"
  );
  return { ok: true, processor: processForceInclusionBatchLocal };
}

import type { SafeProposalRecord, SafeProposalState } from "./types";

const PENDING_BY_STATE: Record<SafeProposalState, boolean> = {
  draft: true,
  authorizing: true,
  approvedLocally: true,
  publishing: true,
  awaitingApprovals: true,
  readyToExecute: true,
  executing: true,
  ambiguous: true,
  stale: true,
  blocked: true,
  executed: false,
  cancelled: false,
  replaced: false,
  failed: false,
};

/**
 * A pending Safe request is still unresolved in the inbox, even when it is
 * temporarily blocked or stale. Hidden and terminal records do not contribute
 * to either the homepage summary or the extension action badge.
 */
export function isPendingSafeProposal(
  proposal: Pick<SafeProposalRecord, "state" | "hiddenAt">,
): boolean {
  return !proposal.hiddenAt && PENDING_BY_STATE[proposal.state];
}

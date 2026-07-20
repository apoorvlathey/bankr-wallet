export type BatchRequestSoundGate = {
  claim: (requestId: string) => boolean;
};

/** Ensures status updates for one logical batch request share one arrival cue. */
export function createBatchRequestSoundGate(): BatchRequestSoundGate {
  const announcedRequestIds = new Set<string>();

  return {
    claim(requestId) {
      if (announcedRequestIds.has(requestId)) return false;
      announcedRequestIds.add(requestId);
      return true;
    },
  };
}

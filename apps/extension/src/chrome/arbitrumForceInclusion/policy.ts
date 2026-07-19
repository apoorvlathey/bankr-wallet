export function isArbitrumForceEligible(args: {
  currentBlock: bigint;
  deadlineBlock: bigint;
  totalDelayedMessagesRead: bigint;
  messageIndex: bigint;
}): boolean {
  return (
    args.totalDelayedMessagesRead <= args.messageIndex &&
    args.currentBlock > args.deadlineBlock
  );
}

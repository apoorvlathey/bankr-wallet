import { Badge, Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type { ERC5792Call } from "@/chrome/erc5792Types";
import { BatchCallsList } from "@/components/BatchCallsList";
import ClearSignedSummaryCard from "@/components/ClearSignedSummaryCard";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import { CopyButton } from "@/components/CopyButton";
import Erc7715PermissionRevokeSummary from "@/components/Erc7715PermissionRevokeSummary";
import {
  EIP_7702_DEFAULT_DELEGATE,
  getKnownDelegateName,
} from "@/constants/chainRegistry";
import { hasDefaultDelegateForChain } from "@/utils/delegationResolution";

export default function ClearSigningSummary({
  tx,
  chainName,
  explorerBase,
  nativeSym,
  batchCalls,
  delegateLabels,
  clearSignedMeta,
}: {
  tx: CompletedTransaction;
  chainName: string;
  explorerBase: string;
  nativeSym: string;
  batchCalls: ERC5792Call[] | null;
  delegateLabels: string[];
  clearSignedMeta: CompletedTransaction["clearSignedMeta"] | undefined;
}) {
  const erc7715RevokeMeta = tx.erc7715PermissionRevokeMeta;
  const delegationMeta = tx.delegation7702Meta;
  const hasBatchCalls = !!batchCalls && batchCalls.length > 0;
  const hasDelegation = !!delegationMeta;

  return (
    <>
      {/* ERC-7715 revoke clear-signing hero. The queued transaction is a
          DelegationManager disable call; without the display snapshot
          the activity modal only shows raw tuple calldata. */}
      {erc7715RevokeMeta && (
        <Erc7715PermissionRevokeSummary
          meta={erc7715RevokeMeta}
          chainId={tx.chainId}
          chainName={chainName}
          explorer={explorerBase}
          nativeSymbol={nativeSym}
        />
      )}

      {/* Per-call hero for atomic batches. Decoded from the ERC-7821
          self-call calldata on open (no storage cost). Reuses the same
          CallCard + clear-signing pipeline the tx-confirmation surface
          uses, so transfers / approves / Permit2 / etc. read as human
          actions instead of a blob. The raw FROM=EOA / TO=EOA / opaque
          calldata stays available inside the collapsed "Transaction
          Details" section below for power-users. */}
      {hasBatchCalls && (
        <VStack spacing={2} align="stretch">
          <HStack spacing={2}>
            <Text
              fontSize="xs"
              color="text.secondary"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
            >
              Calls
            </Text>
            <Badge
              bg="accent.secondary"
              color="accentFg.secondary"
              fontSize="2xs"
              fontWeight="800"
              px={1.5}
              py={0}
              border="1px solid"
              borderColor="border.default"
            >
              {batchCalls!.length}
            </Badge>
          </HStack>
          <BatchCallsList
            calls={batchCalls!}
            chainId={tx.chainId}
            origin={tx.origin}
            favicon={tx.favicon}
            originPerCall={tx.batchCallOrigins}
            originCallIndex={
              tx.bridge ? batchCalls!.length - 1 : undefined
            }
          />
        </VStack>
      )}

      {/* EIP-7702 delegation hero — Set / Revoke txs whose actual
          effect lives in the authorization tuple, not the calldata.
          The raw FROM/TO view shows EOA → EOA so without this card
          the user can't see which contract they delegated to. The
          target address gets the standard copy + explorer pattern. */}
      {hasDelegation && delegationMeta && (() => {
        const isRevoke = delegationMeta.kind === "revoke";
        const target = delegationMeta.targetDelegate;
        const explorer = explorerBase;
        // Prefer the eth.sh label when it resolves; fall back to the
        // built-in "MetaMask DeleGator" tag so the WalletChan default
        // still paints something instantly on first open before the
        // cache warms.
        const ethShLabel = !isRevoke ? delegateLabels[0] ?? null : null;
        const knownName = isRevoke ? null : getKnownDelegateName(target);
        const badgeLabel = ethShLabel ?? knownName;
        const hasDefaultDelegate = hasDefaultDelegateForChain(tx.chainId);
        const isDefault =
          !isRevoke &&
          target.toLowerCase() ===
            EIP_7702_DEFAULT_DELEGATE.toLowerCase();
        return (
          <Box
            bg="surface.sunken"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            p={2.5}
          >
            <VStack align="stretch" spacing={2}>
              <Text
                fontSize="2xs"
                fontWeight="800"
                textTransform="uppercase"
                color="text.tertiary"
                letterSpacing="wide"
              >
                Smart Account
              </Text>
              <Text
                fontSize="sm"
                fontWeight="800"
                color="text.primary"
                lineHeight="short"
              >
                {isRevoke
                  ? "Removed onchain delegation"
                  : isDefault
                    ? "Delegated to WalletChan default"
                    : "Delegated to custom contract"}
              </Text>
              {!isRevoke && (
                <Box>
                  <HStack justify="space-between" align="center" mb={1}>
                    <Text
                      fontSize="2xs"
                      color="text.tertiary"
                      fontWeight="700"
                      textTransform="uppercase"
                    >
                      Delegate
                    </Text>
                    {badgeLabel && (
                      <Badge
                        bg="accent.secondary"
                        color="accentFg.secondary"
                        fontSize="2xs"
                        fontWeight="800"
                        px={1.5}
                        py={0}
                        border="1px solid"
                        borderColor="border.default"
                        maxW="60%"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                      >
                        {badgeLabel}
                      </Badge>
                    )}
                  </HStack>
                  <HStack
                    spacing={1}
                    px={1.5}
                    py={1}
                    bg="surface.raised"
                    border="1.5px solid"
                    borderColor="border.subtle"
                    borderRadius="md"
                    align="center"
                  >
                    <Text
                      fontSize="xs"
                      fontFamily="mono"
                      fontWeight="700"
                      color="text.primary"
                      isTruncated
                      flex="1"
                      minW={0}
                    >
                      {target.slice(0, 10)}…{target.slice(-8)}
                    </Text>
                    <CopyButton value={target} />
                    {explorer && (
                      <IconButton
                        aria-label="View delegate on explorer"
                        icon={<ExternalLinkIcon boxSize="10px" />}
                        size="xs"
                        variant="ghost"
                        minW="18px"
                        h="18px"
                        color="text.tertiary"
                        onClick={() =>
                          chrome.tabs.create({
                            url: `${explorer}/address/${target}`,
                          })
                        }
                        _hover={{
                          color: "accent.secondary",
                          bg: "bg.muted",
                        }}
                      />
                    )}
                  </HStack>
                </Box>
              )}
              <Text
                fontSize="2xs"
                color="text.tertiary"
                lineHeight="short"
              >
                {isRevoke
                  ? `Account is no longer a smart account on this chain.${
                      hasDefaultDelegate
                        ? " Future batches fall back to WalletChan default delegation if present."
                        : ""
                    }`
                  : "Future multi-call batches on this chain execute atomically via this contract."}
              </Text>
            </VStack>
          </Box>
        );
      })()}

      {/* Human-readable clear-signed hero. Snapshot-driven, so it
          paints synchronously on every reopen — no RPC / eth.sh / ENS
          calls. Hidden when no snapshot was captured (older entries,
          contract deploys, opaque calldata).

          For erc7730 kinds the snapshot only stores intent +
          contractName + counterparty (no parameter values), so we
          render the full ClearSigningView instead — same component the
          tx-confirmation surface uses. It re-decodes the calldata
          against the descriptor to produce per-field rows (e.g.
          "Amount to supply: 2 USDC", "Collateral recipient: …"). */}
      {clearSignedMeta && clearSignedMeta.kind === "erc7730" && tx.tx.to && tx.tx.data ? (
        <ClearSigningView
          kind="calldata"
          chainId={tx.chainId}
          from={tx.tx.from}
          to={tx.tx.to}
          calldata={tx.tx.data}
          value={tx.tx.value}
        />
      ) : clearSignedMeta ? (
        <ClearSignedSummaryCard meta={clearSignedMeta} chainId={tx.chainId} />
      ) : null}
    </>
  );
}

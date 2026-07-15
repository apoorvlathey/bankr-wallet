import { memo, useEffect, useMemo, useState } from "react";
import { Button, Spinner } from "@chakra-ui/react";

import { CopyButton } from "@/components/CopyButton";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import {
  getErc7715PermissionTokenAddress,
  isErc7715NativePermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";
import { useIconChipBg, useStripTokens } from "@/theme";
import { Erc7715PermissionScreen } from "./Erc7715PermissionScreen";
import { Erc7715PermissionEditableControls } from "./Erc7715PermissionEditableControls";
import { PermissionAdvancedDetails } from "./PermissionAdvancedDetails";
import { PermissionDecisionSummary } from "./PermissionDecisionSummary";
import { PermissionLimits } from "./PermissionLimits";
import { PermissionSummary } from "./PermissionSummary";
import {
  buildPermissionPresentation,
  canGrantErc7715Permission,
} from "./permissionPresentation";
import type { Erc7715PermissionConfirmationProps } from "./types";
import { useDisplayedPermissionCaveats } from "./useDisplayedPermissionCaveats";
import { useErc7715PermissionAsset } from "./useErc7715PermissionAsset";
import { useErc7715PermissionActions } from "./useErc7715PermissionActions";

function Erc7715PermissionConfirmation({
  permissionRequest,
  currentIndex,
  totalCount,
  accountType = permissionRequest.accountType,
  onBack,
  onConfirmed,
  onCancelled,
  onCancelAll,
  onBeforeCancel,
  onNavigate,
}: Erc7715PermissionConfirmationProps) {
  const { networksInfo } = useNetworks();
  const iconChipBg = useIconChipBg();
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const [editedRequest, setEditedRequest] = useState(permissionRequest.request);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    setEditedRequest(permissionRequest.request);
    setDraftError(null);
  }, [permissionRequest]);

  const resolvedChain = getResolvedChainById(
    permissionRequest.chainId,
    networksInfo,
  );
  const chainConfig = getChainConfig(permissionRequest.chainId);
  const chainName = resolvedChain?.name ?? permissionRequest.chainName;
  const explorer = resolvedChain?.explorer || chainConfig.explorer;
  const nativeSymbol = resolvedChain?.nativeCurrency.symbol || "ETH";
  const isRevocation = isErc7715TokenApprovalRevocationPermissionType(
    permissionRequest.permissionType,
  );
  const isNative = isErc7715NativePermissionType(
    permissionRequest.permissionType,
  );
  const tokenAddress = isRevocation
    ? null
    : getErc7715PermissionTokenAddress(editedRequest);
  const asset = useErc7715PermissionAsset({
    permissionRequest,
    editedRequest,
    explorer,
    nativeSymbol,
    tokenAddress,
    isNative,
    disabled: isRevocation,
  });
  const displayedCaveats = useDisplayedPermissionCaveats(
    permissionRequest,
    editedRequest,
  );
  const presentation = useMemo(
    () =>
      buildPermissionPresentation({
        permissionRequest,
        editedRequest,
        asset,
      }),
    [asset, editedRequest, permissionRequest],
  );
  const canGrant = canGrantErc7715Permission(accountType);
  const actions = useErc7715PermissionActions({
    permissionRequest,
    editedRequest,
    canGrant,
    draftError,
    onBeforeCancel,
    onCancelled,
    onConfirmed,
  });
  const rawRequest = useMemo(
    () => JSON.stringify(editedRequest, null, 2),
    [editedRequest],
  );

  const rejectButton = (
    <Button
      variant={canGrant ? "secondary" : "danger"}
      onClick={actions.reject}
      isDisabled={actions.isSubmitting}
      isLoading={actions.isRejecting}
      loadingText="Rejecting"
      spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
    >
      Reject
    </Button>
  );

  return (
    <Erc7715PermissionScreen
      onBack={onBack}
      trailing={
        <CopyButton value={rawRequest} label="Copy permission request" />
      }
      currentIndex={currentIndex}
      totalCount={totalCount}
      stripBg={stripBg}
      stripFg={stripFg}
      onNavigate={onNavigate}
      onRejectAll={onCancelAll}
      origin={presentation.origin}
      originHostname={presentation.originHostname}
      favicon={permissionRequest.favicon}
      originInitials={presentation.originInitials}
      iconChipBg={iconChipBg}
      summary={
        <PermissionSummary
          title={presentation.title}
          description={presentation.description}
          canGrant={canGrant}
        />
      }
      chainId={permissionRequest.chainId}
      chainName={chainName}
      limits={
        <PermissionLimits
          permissionRequest={permissionRequest}
          presentation={presentation}
          asset={asset}
          isNative={isNative}
          explorer={explorer}
          delegate={editedRequest.to}
          justification={editedRequest.permission.justification}
          validationError={draftError}
        >
          <Erc7715PermissionEditableControls
            permissionRequest={permissionRequest}
            editedRequest={editedRequest}
            asset={asset}
            validationError={draftError}
            onEditedRequestChange={setEditedRequest}
            onValidationErrorChange={setDraftError}
          />
        </PermissionLimits>
      }
      advancedDetails={
        <PermissionAdvancedDetails
          permissionType={presentation.permissionTypeLabel}
          caveats={displayedCaveats}
          rawRequest={rawRequest}
          explorer={explorer}
        />
      }
      actionSummary={
        <PermissionDecisionSummary address={editedRequest.from} />
      }
      confirmAction={
        canGrant ? (
          <Button
            variant="brand"
            onClick={actions.confirm}
            isDisabled={actions.isRejecting || Boolean(draftError)}
            isLoading={actions.isSubmitting}
            loadingText="Granting"
          >
            Grant permission
          </Button>
        ) : (
          rejectButton
        )
      }
      rejectAction={canGrant ? rejectButton : undefined}
    />
  );
}

export default memo(Erc7715PermissionConfirmation);

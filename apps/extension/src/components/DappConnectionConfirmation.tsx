import { useMemo, useState, type ReactNode } from "react";
import { Box, Button, Flex, Heading, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import type { Account } from "@/chrome/types";
import type { PendingDappConnectionRequest } from "@/chrome/requests/dappPermissionStorage";
import DappConnectionAccountSelector from "@/components/DappConnectionAccountSelector";
import { ConfirmationScreen } from "@/components/ui";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import DappSiteIcon from "@/components/DappSiteIcon";
import DisplayModeMenu from "@/components/DisplayModeMenu";
import { playInteractionSound } from "@/sounds/soundManager";

interface DappConnectionConfirmationProps {
  request: PendingDappConnectionRequest;
  accounts: Account[];
  account: Account;
  sidePanelSupported: boolean;
  sidePanelMode: boolean;
  isFullscreenTab: boolean;
  onAccountSelect: (account: Account) => void | Promise<void>;
  onToggleSidePanel: () => void;
  onOpenFullscreen: () => void;
  onFinished: () => void;
}

const permissionIconProps = {
  boxSize: "18px",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function AddressPermissionIcon() {
  return (
    <Icon {...permissionIconProps} aria-hidden="true">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

function RequestPermissionIcon() {
  return (
    <Icon {...permissionIconProps} aria-hidden="true">
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </Icon>
  );
}

function PrivatePermissionIcon() {
  return (
    <Icon {...permissionIconProps} aria-hidden="true">
      <circle cx="12" cy="16" r="1" />
      <rect x="3" y="10" width="18" height="12" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
    </Icon>
  );
}

function PermissionRow({
  icon,
  children,
  fontSize = "sm",
}: {
  icon: ReactNode;
  children: ReactNode;
  fontSize?: "xs" | "sm";
}) {
  return (
    <HStack align="center" spacing={2.5} minH="28px">
      <Flex
        boxSize="24px"
        align="center"
        justify="center"
        flexShrink={0}
        color="accent.secondary"
      >
        {icon}
      </Flex>
      <Text color="fg.secondary" fontSize={fontSize} lineHeight="1.45">
        {children}
      </Text>
    </HStack>
  );
}

export default function DappConnectionConfirmation({
  request,
  accounts,
  account,
  sidePanelSupported,
  sidePanelMode,
  isFullscreenTab,
  onAccountSelect,
  onToggleSidePanel,
  onOpenFullscreen,
  onFinished,
}: DappConnectionConfirmationProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const formatOrigin = useDappOriginFormatter();
  const displayOrigin = formatOrigin(request.origin);
  const favicon = useMemo(
    () => request.favicon || googleFaviconUrl(request.hostname, 64),
    [request.favicon, request.hostname],
  );

  const finish = async (type: "confirmDappConnection" | "rejectDappConnection") => {
    if (type === "confirmDappConnection") {
      void playInteractionSound("dappConnectionConfirm");
      setIsConfirming(true);
    } else {
      setIsRejecting(true);
    }
    try {
      await chrome.runtime.sendMessage({ type, requestId: request.id });
      onFinished();
    } finally {
      setIsConfirming(false);
      setIsRejecting(false);
    }
  };

  return (
    <ConfirmationScreen
      title="Connect site"
      onBack={() => void finish("rejectDappConnection")}
      backLabel="Reject connection request"
      trailing={
        <DisplayModeMenu
          sidePanelSupported={sidePanelSupported}
          sidePanelMode={sidePanelMode}
          isFullscreenTab={isFullscreenTab}
          onToggleSidePanel={onToggleSidePanel}
          onOpenFullscreen={onOpenFullscreen}
        />
      }
      outcome={
        <VStack
          as="section"
          aria-labelledby="dapp-connection-site"
          align="center"
          spacing={3}
          px={2}
          pt={2}
          textAlign="center"
        >
          <DappSiteIcon
            src={displayOrigin.faviconSrc || favicon}
            fallbackSrc={displayOrigin.faviconFallbackSrc}
            label={displayOrigin.label}
            size="64px"
            imageSize="44px"
          />
          <VStack align="center" spacing={1} minW={0} w="full">
            <Text color="fg.secondary" fontSize="xs" fontWeight="600">
              Connection request
            </Text>
            <Heading
              as="h2"
              id="dapp-connection-site"
              color="fg.primary"
              fontSize="2xl"
              lineHeight="1.2"
              maxW="full"
              overflowWrap="anywhere"
            >
              {displayOrigin.label}
            </Heading>
          </VStack>
        </VStack>
      }
      contextTitle="Connecting as"
      context={
        <VStack align="stretch" spacing={4}>
          <DappConnectionAccountSelector
            accounts={accounts}
            account={account}
            onAccountSelect={onAccountSelect}
          />

          <VStack as="section" aria-label="Site permissions" align="stretch" spacing={3} px={1}>
            <Text color="fg.primary" fontSize="sm" fontWeight="600">
              This site can
            </Text>
            <PermissionRow icon={<AddressPermissionIcon />}>
              See this account address
            </PermissionRow>
            <PermissionRow icon={<RequestPermissionIcon />}>
              Request transactions and signatures
            </PermissionRow>
            <Box pt={3}>
              <PermissionRow icon={<PrivatePermissionIcon />} fontSize="xs">
                Keys stay private. You approve every request.
              </PermissionRow>
            </Box>
          </VStack>

        </VStack>
      }
      rejectAction={
        <Button
          variant="secondary"
          isLoading={isRejecting}
          isDisabled={isConfirming}
          onClick={() => void finish("rejectDappConnection")}
        >
          Cancel
        </Button>
      }
      confirmAction={
        <Button
          variant="brand"
          isLoading={isConfirming}
          isDisabled={isRejecting}
          onClick={() => void finish("confirmDappConnection")}
        >
          Connect
        </Button>
      }
    />
  );
}

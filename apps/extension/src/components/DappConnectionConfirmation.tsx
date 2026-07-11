import { useMemo, useState } from "react";
import { Button, HStack, Text, VStack } from "@chakra-ui/react";
import { LockIcon } from "@chakra-ui/icons";
import type { Account } from "@/chrome/types";
import type { PendingDappConnectionRequest } from "@/chrome/dappPermissionStorage";
import { AccountAvatar } from "@/components/AccountIdentity";
import { CopyButton } from "@/components/CopyButton";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import {
  ConfirmationScreen,
  ListItem,
  ListItemContent,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  OutcomeCard,
} from "@/components/ui";
import { googleFaviconUrl } from "@/constants/externalUrls";
import DappSiteIcon from "@/components/DappSiteIcon";

interface DappConnectionConfirmationProps {
  request: PendingDappConnectionRequest;
  account: Account;
  onFinished: () => void;
}

export default function DappConnectionConfirmation({
  request,
  account,
  onFinished,
}: DappConnectionConfirmationProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const favicon = useMemo(
    () => request.favicon || googleFaviconUrl(request.hostname, 64),
    [request.favicon, request.hostname],
  );

  const finish = async (type: "confirmDappConnection" | "rejectDappConnection") => {
    type === "confirmDappConnection" ? setIsConfirming(true) : setIsRejecting(true);
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
      outcome={
        <OutcomeCard
          label="Connection request"
          outcome={request.hostname}
          context={
            <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
              {request.title && request.title !== request.hostname
                ? `${request.title} wants to connect to WalletChan.`
                : "This site wants to connect to WalletChan."}
            </Text>
          }
          media={
            <DappSiteIcon
              src={favicon}
              label={request.hostname}
              size="48px"
              imageSize="32px"
            />
          }
        />
      }
      contextTitle="What you’re sharing"
      context={
        <VStack align="stretch" spacing={3}>
          <ListSurface>
            <ListItem>
              <ListItemMedia>
                <AccountAvatar account={account} ensAvatar={null} size={34} />
              </ListItemMedia>
              <ListItemContent>
                <ListItemTitle>{account.displayName || "Current account"}</ListItemTitle>
                <HStack minW={0} spacing={1.5}>
                  <MiddleTruncatedAddress address={account.address} />
                  <CopyButton value={account.address} label="Copy account address" />
                </HStack>
              </ListItemContent>
            </ListItem>
          </ListSurface>

          <HStack align="start" spacing={3} px={1}>
            <LockIcon mt="3px" color="accent.secondary" flexShrink={0} />
            <VStack align="start" spacing={1}>
              <Text color="fg.primary" fontSize="sm" fontWeight="600">
                Your keys stay private
              </Text>
              <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
                This site can see your current wallet address and request actions.
                Every transaction or signature still needs your approval.
              </Text>
            </VStack>
          </HStack>
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
          variant="primary"
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

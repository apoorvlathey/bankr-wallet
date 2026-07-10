import { memo } from "react";
import { LinkIcon } from "@chakra-ui/icons";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";

interface WalletConnectBannerProps {
  sessionCount: number;
  onClick: () => void;
}

function WalletConnectBanner({ sessionCount, onClick }: WalletConnectBannerProps) {
  if (sessionCount === 0) return null;

  return (
    <ListSurface aria-label="Connected apps">
      <ListItem
        interactive
        as="button"
        onClick={onClick}
        aria-label={`Connected apps, ${sessionCount} active`}
      >
        <ListItemMedia>
          <LinkIcon boxSize="18px" aria-hidden="true" />
        </ListItemMedia>
        <ListItemContent>
          <ListItemTitle>Connected apps</ListItemTitle>
          <ListItemDescription>
            {sessionCount} active WalletConnect {sessionCount === 1 ? "session" : "sessions"}
          </ListItemDescription>
        </ListItemContent>
        <ListItemMeta>Manage</ListItemMeta>
      </ListItem>
    </ListSurface>
  );
}

export default memo(WalletConnectBanner);

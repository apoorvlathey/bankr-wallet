import { Badge,
  Box,
  Icon,
} from "@chakra-ui/react";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  LinkIcon,
} from "@chakra-ui/icons";
import {
  REVOKE_CASH_URL,
  revokeCashAddressUrl,
  WALLETCHAN_MIGRATE_URL,
  WALLETCHAN_STAKE_URL,
  WALLETCHAN_VAULT_DATA_API,
} from "@/constants/externalUrls";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import ConnectedDappsView from "@/components/ConnectedDappsView";
import WalletConnectLogoIcon from "@/components/WalletConnectLogoIcon";
import { GlobeIcon } from "@/components/Settings/icons";
import { useEffect, useState } from "react";
import {
  AppHeader,
  AppScreen,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
} from "@/components/ui";

interface MoreActionsViewProps {
  onBack: () => void;
  onWalletConnect: () => void;
  fromAddress: string;
  walletConnectSessionCount?: number;
}

interface MoreAction {
  title: string;
  detail: string;
  icon: JSX.Element;
  iconBg: string;
  iconColor: string;
  badge?: string;
  highlighted?: boolean;
  external?: boolean;
  onClick?: () => void;
}

const StakeIcon = () => (
  <Icon
    viewBox="0 0 24 24"
    boxSize={5}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </Icon>
);

const MigrateIcon = () => (
  <Icon
    viewBox="0 0 24 24"
    boxSize={5}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 7h11" />
    <path d="M13 4l3 3-3 3" />
    <path d="M19 17H8" />
    <path d="M11 14l-3 3 3 3" />
  </Icon>
);

const RevokeIcon = () => (
  <Icon
    viewBox="0 0 24 24"
    boxSize={5}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
    <path d="M8 12h8" />
  </Icon>
);

function openExternal(url: string) {
  chrome.tabs.create({ url });
}

function ActionBadge({ children }: { children: string }) {
  return (
    <Badge
      bg="accent.highlight"
      color="accentFg.highlight"
      border="1px solid"
      borderColor="border.default"
      fontSize="9px"
      fontWeight="900"
      px={1.5}
      py="1px"
      lineHeight="1.1"
      textTransform="uppercase"
    >
      {children}
    </Badge>
  );
}

function ActionListRow({ action }: { action: MoreAction }) {
  return (
    <ListItem
      interactive
      tone={action.highlighted ? "highlight" : "default"}
      onClick={action.onClick}
    >
      <ListItemMedia>
        <Box bg={action.iconBg} color={action.iconColor} borderRadius="md" p={2}>
          {action.icon}
        </Box>
      </ListItemMedia>
      <ListItemContent>
        <ListItemTitle>{action.title}</ListItemTitle>
        <ListItemDescription
          color={action.highlighted ? "accentFg.highlight" : undefined}
        >
          {action.detail}
        </ListItemDescription>
      </ListItemContent>
      <ListItemMeta
        color={action.highlighted ? "accentFg.highlight" : undefined}
      >
        {action.badge ? (
          <ActionBadge>{action.badge}</ActionBadge>
        ) : action.external === false ? (
          <ChevronRightIcon aria-hidden="true" />
        ) : (
          <ExternalLinkIcon aria-hidden="true" />
        )}
      </ListItemMeta>
    </ListItem>
  );
}

export default function MoreActionsView({
  onBack,
  onWalletConnect,
  fromAddress,
  walletConnectSessionCount = 0,
}: MoreActionsViewProps) {
  const [stakeApy, setStakeApy] = useState<number | null>(null);
  const [showConnectedDapps, setShowConnectedDapps] = useState(false);
  const isFirefox =
    typeof navigator !== "undefined" && /Firefox/.test(navigator.userAgent);

  useEffect(() => {
    const controller = new AbortController();

    const fetchApy = () => {
      fetch(WALLETCHAN_VAULT_DATA_API, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.totalApy != null) setStakeApy(data.totalApy);
        })
        .catch(() => {});
    };

    fetchApy();
    const interval = window.setInterval(fetchApy, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const primaryActions: MoreAction[] = [
    {
      title: "Stake",
      detail: "WCHAN vault",
      icon: <StakeIcon />,
      iconBg: "accent.primary",
      iconColor: "accentFg.primary",
      badge: stakeApy !== null ? `${stakeApy.toFixed(1)}% APY` : undefined,
      onClick: () => openExternal(WALLETCHAN_STAKE_URL),
    },
    {
      title: "Migrate tokens",
      detail: "walletchan.eth.sh/migrate",
      icon: <MigrateIcon />,
      iconBg: "accent.secondary",
      iconColor: "accentFg.secondary",
      onClick: () => openExternal(WALLETCHAN_MIGRATE_URL),
    },
  ];

  const secondaryActions: MoreAction[] = [
    {
      title: "Connected dapps",
      detail: "Manage approved sites",
      icon: <LinkIcon boxSize={5} />,
      iconBg: "accent.highlight",
      iconColor: "accentFg.highlight",
      external: false,
      onClick: () => setShowConnectedDapps(true),
    },
    {
      title: "WalletConnect",
      detail:
        walletConnectSessionCount > 0
          ? `${walletConnectSessionCount} active ${walletConnectSessionCount === 1 ? "session" : "sessions"}`
          : "Connect dapps by URI",
      icon: <WalletConnectLogoIcon />,
      iconBg: walletConnectSessionCount > 0 ? "surface.base" : "accent.secondary",
      iconColor:
        walletConnectSessionCount > 0
          ? "accent.highlight"
          : "accentFg.secondary",
      highlighted: walletConnectSessionCount > 0,
      external: false,
      onClick: onWalletConnect,
    },
    ...(!isFirefox
      ? [
          {
            title: "dapp3 browser",
            detail: "ENS, IPFS, onchain HTML",
            icon: <GlobeIcon boxSize={5} />,
            iconBg: "chart.positive",
            iconColor: "surface.base",
            onClick: () => openExternal(chrome.runtime.getURL("browse.html")),
          },
        ]
      : []),
    {
      title: "Revoke approvals",
      detail: "revoke.cash",
      icon: <RevokeIcon />,
      iconBg: "accent.highlight",
      iconColor: "accentFg.highlight",
      onClick: () =>
        openExternal(
          fromAddress ? revokeCashAddressUrl(fromAddress) : REVOKE_CASH_URL,
        ),
    },
  ];

  if (showConnectedDapps) {
    return <ConnectedDappsView onBack={() => setShowConnectedDapps(false)} />;
  }

  return (
    <AppScreen>
      <AppHeader
        title="More"
        onBack={onBack}
        trailing={fromAddress ? <FromAccountDisplay address={fromAddress} /> : undefined}
      />
      <ScreenBody pb={6}>
        <ScreenSection title="WalletChan">
          <ListSurface>
            {primaryActions.map((action) => (
              <ActionListRow key={action.title} action={action} />
            ))}
          </ListSurface>
        </ScreenSection>
        <ScreenSection title="Tools" mt={5}>
          <ListSurface>
            {secondaryActions.map((action) => (
              <ActionListRow key={action.title} action={action} />
            ))}
          </ListSurface>
        </ScreenSection>
      </ScreenBody>
    </AppScreen>
  );
}

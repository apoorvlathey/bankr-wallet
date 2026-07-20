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
  WALLETCHAN_STAKE_URL,
  WALLETCHAN_VAULT_DATA_API,
} from "@/constants/externalUrls";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import ConnectedDappsView from "@/components/ConnectedDappsView";
import WalletConnectLogoIcon from "@/components/WalletConnectLogoIcon";
import { GlobeIcon } from "@/components/Settings/icons";
import { useEffect, useState } from "react";
import AddressBookScreen from "@/components/AddressBook/AddressBookScreen";
import { fetchJsonBounded } from "@/chrome/network/boundedHttp";
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
  detailColor?: string;
  metaColor?: string;
  activeIndicator?: boolean;
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

const BookUserIcon = () => (
  <Icon
    viewBox="0 0 24 24"
    boxSize={5}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 13a3 3 0 1 0-6 0" />
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    <circle cx="12" cy="8" r="2" />
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
      onClick={action.onClick}
    >
      <ListItemMedia>
        <Box bg={action.iconBg} color={action.iconColor} borderRadius="md" p={2}>
          {action.icon}
        </Box>
      </ListItemMedia>
      <ListItemContent>
        <ListItemTitle>{action.title}</ListItemTitle>
        <ListItemDescription>
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            gap={2}
            color={action.detailColor}
          >
            {action.activeIndicator && (
              <Box
                as="span"
                boxSize="7px"
                flexShrink={0}
                borderRadius="full"
                bg="accent.highlight"
                aria-hidden="true"
              />
            )}
            {action.detail}
          </Box>
        </ListItemDescription>
      </ListItemContent>
      <ListItemMeta color={action.metaColor}>
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
  const [showAddressBook, setShowAddressBook] = useState(false);
  const isFirefox =
    typeof navigator !== "undefined" && /Firefox/.test(navigator.userAgent);

  useEffect(() => {
    const controller = new AbortController();

    const fetchApy = () => {
      fetchJsonBounded(
        WALLETCHAN_VAULT_DATA_API,
        { method: "GET", signal: controller.signal },
        { timeoutMs: 8_000, maxBytes: 64 * 1024 },
      )
        .then(({ response, data }) => {
          const payload =
            response.ok && data && typeof data === "object"
              ? data as { totalApy?: unknown }
              : null;
          if (typeof payload?.totalApy === "number") {
            setStakeApy(payload.totalApy);
          }
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
  ];

  const secondaryActions: MoreAction[] = [
    {
      title: "Address book",
      detail: "Label frequently used addresses",
      icon: <BookUserIcon />,
      iconBg: "accent.secondary",
      iconColor: "accentFg.secondary",
      external: false,
      onClick: () => setShowAddressBook(true),
    },
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
      iconBg: "accent.secondary",
      iconColor: "accentFg.secondary",
      detailColor:
        walletConnectSessionCount > 0 ? "accent.highlight" : undefined,
      metaColor:
        walletConnectSessionCount > 0 ? "accent.highlight" : undefined,
      activeIndicator: walletConnectSessionCount > 0,
      external: false,
      onClick: onWalletConnect,
    },
    ...(!isFirefox
      ? [
          {
            title: "WalletChan Browser",
            detail: "Search and Browse Dapps",
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

  if (showAddressBook) {
    return <AddressBookScreen onBack={() => setShowAddressBook(false)} />;
  }

  return (
    <AppScreen>
      <AppHeader
        title="More"
        onBack={onBack}
        trailing={fromAddress ? <FromAccountDisplay address={fromAddress} /> : undefined}
      />
      <ScreenBody pt={4} pb={6}>
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

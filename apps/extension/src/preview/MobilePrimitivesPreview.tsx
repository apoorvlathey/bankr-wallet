import { useRef, useState } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  IconButton,
  Text,
} from "@chakra-ui/react";
import {
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  SettingsIcon,
} from "@chakra-ui/icons";
import { ScreenStack, type AppView } from "@/components/ScreenTransition";
import {
  ActionSheet,
  AppHeader,
  AppScreen,
  type ActionSheetChoice,
  FullScreenPicker,
  FullScreenPickerGroup,
  FullScreenPickerScopes,
  FullScreenPickerSearch,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
  StickyActionBar,
} from "@/components/ui";

const TOKENS = [
  ["ETH", "Ethereum", "0.0087199", "$15.23", "#627EEA"],
  ["USDC", "USD Coin", "321.12", "$321.12", "#2775CA"],
  ["WCHAN", "WalletChan", "382,334", "$0.55", "#D99532"],
  ["USDT", "Tether USD", "48.20", "$48.20", "#26A17B"],
  ["WETH", "Wrapped Ether", "0.042", "$73.46", "#555B6E"],
  ["DEGEN", "Degen", "12,560", "$43.96", "#8B5CF6"],
  ["AERO", "Aerodrome", "22.8", "$17.31", "#3B82F6"],
  ["cbBTC", "Coinbase Wrapped BTC", "0.0004", "$41.84", "#F59E0B"],
] as const;

const SHEET_CHOICES: readonly ActionSheetChoice[] = [
  {
    id: "copy",
    label: "Copy address",
    description: "Copy the full account address",
    icon: <CopyIcon />,
  },
  {
    id: "explorer",
    label: "View on explorer",
    description: "Open this account on Basescan",
    icon: <ExternalLinkIcon />,
  },
  {
    id: "hide",
    label: "Hide account",
    description: "Remove it from the account switcher",
    isDestructive: true,
  },
];

function RootScreen({
  onOpenDetail,
  onOpenPicker,
  onOpenSheet,
  sheetTriggerRef,
}: {
  onOpenDetail: () => void;
  onOpenPicker: () => void;
  onOpenSheet: () => void;
  sheetTriggerRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <AppScreen>
      <AppHeader
        title="Wallet"
        trailing={
          <IconButton
            aria-label="Settings"
            icon={<SettingsIcon />}
            variant="ghost"
          />
        }
      />
      <ScreenBody pt={4}>
        <ScreenSection
          title="Mobile screen grammar"
          description="One scroll owner, quiet list surfaces, and pushed destinations."
        >
          <ListSurface>
            <ListItem interactive onClick={onOpenDetail}>
              <ListItemMedia>
                <Avatar size="sm" name="WalletChan" bg="accent.primary" />
              </ListItemMedia>
              <ListItemContent>
                <ListItemTitle>Account details</ListItemTitle>
                <ListItemDescription>Identity, network, and address</ListItemDescription>
              </ListItemContent>
              <ChevronRightIcon color="fg.muted" boxSize={5} />
            </ListItem>
            <ListItem interactive onClick={onOpenPicker}>
              <ListItemMedia>
                <Box boxSize={8} borderRadius="full" bg="accent.primary" />
              </ListItemMedia>
              <ListItemContent>
                <ListItemTitle>Select an asset</ListItemTitle>
                <ListItemDescription>Searchable choices use a screen</ListItemDescription>
              </ListItemContent>
              <ChevronRightIcon color="fg.muted" boxSize={5} />
            </ListItem>
            <ListItem interactive onClick={onOpenSheet} ref={sheetTriggerRef}>
              <ListItemContent>
                <ListItemTitle>Quick account actions</ListItemTitle>
                <ListItemDescription>Three choices use an action sheet</ListItemDescription>
              </ListItemContent>
              <ChevronRightIcon color="fg.muted" boxSize={5} />
            </ListItem>
          </ListSurface>
        </ScreenSection>

        <ScreenSection mt={6} title="Scroll restoration">
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
            Scroll this screen, open a destination, and go Back. The screen
            stack restores this position and returns focus to the trigger.
          </Text>
          <Box h="240px" />
          <Badge variant="info">End of test content</Badge>
        </ScreenSection>
      </ScreenBody>
      <StickyActionBar primaryAction={<Button variant="primary">Continue</Button>} />
    </AppScreen>
  );
}

function DetailScreen({ onBack }: { onBack: () => void }) {
  return (
    <AppScreen>
      <AppHeader title="Account details with a safely truncated long title" onBack={onBack} />
      <ScreenBody pt={4}>
        <ScreenSection title="walletchan.eth" description="Imported account · Base">
          <ListSurface>
            <ListItem>
              <ListItemContent>
                <ListItemTitle>Address</ListItemTitle>
                <ListItemDescription fontFamily="mono">
                  0xab7def9e...5410e6
                </ListItemDescription>
              </ListItemContent>
              <ListItemMeta>Copied safely</ListItemMeta>
            </ListItem>
            <ListItem>
              <ListItemContent>
                <ListItemTitle>Network</ListItemTitle>
                <ListItemDescription>Base</ListItemDescription>
              </ListItemContent>
              <Badge variant="success">Active</Badge>
            </ListItem>
          </ListSurface>
        </ScreenSection>
        <ScreenSection mt={6} title="About this account">
          <Text color="fg.secondary" fontSize="sm">
            Keys stay encrypted in this browser. WalletChan asks before every
            dapp action and shows the expected balance changes first.
          </Text>
        </ScreenSection>
      </ScreenBody>
      <StickyActionBar
        secondaryAction={<Button variant="outline">Remove</Button>}
        primaryAction={<Button variant="primary">Done</Button>}
      />
    </AppScreen>
  );
}

function PickerScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("base");
  const visible = TOKENS.filter(([symbol, name]) =>
    `${symbol} ${name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const controls = (
    <>
      <FullScreenPickerSearch
        label="Search assets"
        placeholder="Name, symbol, or address"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <FullScreenPickerScopes aria-label="Network scope">
        {["base", "ethereum", "polygon"].map((network) => (
          <Button
            key={network}
            size="sm"
            variant={network === scope ? "primary" : "secondary"}
            flexShrink={0}
            onClick={() => setScope(network)}
          >
            {network[0].toUpperCase() + network.slice(1)}
          </Button>
        ))}
      </FullScreenPickerScopes>
    </>
  );

  return (
    <FullScreenPicker title="Select asset" onBack={onBack} controls={controls}>
      <FullScreenPickerGroup
        label={`Assets on ${scope[0].toUpperCase() + scope.slice(1)}`}
        description={`${visible.length} available in this preview`}
      >
        {visible.map(([symbol, name, amount, value, color]) => (
          <ListItem key={symbol} interactive isSelected={symbol === "USDC"} onClick={onBack}>
            <ListItemMedia>
              <Avatar size="sm" name={symbol} bg={color} color="white" />
            </ListItemMedia>
            <ListItemContent>
              <ListItemTitle>{symbol}</ListItemTitle>
              <ListItemDescription>{name}</ListItemDescription>
            </ListItemContent>
            <ListItemMeta>
              <Text as="span" display="block" color="fg.primary">{amount}</Text>
              <Text as="span" display="block" fontSize="xs">{value}</Text>
            </ListItemMeta>
          </ListItem>
        ))}
      </FullScreenPickerGroup>
    </FullScreenPicker>
  );
}

export default function MobilePrimitivesPreview({ scenario }: { scenario: string }) {
  const initialView: AppView = scenario === "picker" ? "settingsAddChain" : "main";
  const [view, setView] = useState<AppView>(initialView);
  const [isSheetOpen, setIsSheetOpen] = useState(scenario === "sheet");
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);

  const screen = view === "settings"
    ? <DetailScreen onBack={() => setView("main")} />
    : view === "settingsAddChain"
      ? <PickerScreen onBack={() => setView("main")} />
      : (
          <RootScreen
            onOpenDetail={() => setView("settings")}
            onOpenPicker={() => setView("settingsAddChain")}
            onOpenSheet={() => setIsSheetOpen(true)}
            sheetTriggerRef={sheetTriggerRef}
          />
        );

  return (
    <Box h="100%" minH={0} bg="surface.base">
      <ScreenStack view={view}>{screen}</ScreenStack>
      <ActionSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title="Account actions"
        description="Choose one quick action. Longer tasks open as screens."
        choices={SHEET_CHOICES}
        onSelect={() => {}}
        finalFocusRef={sheetTriggerRef}
      />
    </Box>
  );
}

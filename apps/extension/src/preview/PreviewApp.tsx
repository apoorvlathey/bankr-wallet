import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  Select,
  SimpleGrid,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { themeList, useTheme } from "@/theme";
import { PreviewScreen } from "./PreviewScreens";
import {
  PREVIEW_ROUTE_REGISTRY,
  PREVIEW_ROUTES,
} from "./routeRegistry";
import {
  parsePreviewState,
  previewStateUrl,
} from "./previewState";
import type {
  FrameMode,
  PreviewRoute,
  PreviewState,
  PreviewWalletType,
} from "./types";

const FRAME_MODES: Array<{
  id: FrameMode;
  label: string;
  width: string;
  height: string;
}> = [
  { id: "compact", label: "320x568", width: "320px", height: "568px" },
  { id: "popup", label: "360x600", width: "360px", height: "600px" },
  { id: "window", label: "480x720", width: "480px", height: "720px" },
  { id: "sidepanel", label: "420x760", width: "420px", height: "760px" },
  {
    id: "fullscreen",
    label: "Full screen",
    width: "calc(100vw - 40px)",
    height: "100vh",
  },
];

const WALLET_TYPES: Array<{ id: PreviewWalletType; label: string }> = [
  { id: "bankr", label: "Bankr" },
  { id: "privateKey", label: "Private key" },
  { id: "seedPhrase", label: "Seed phrase" },
  { id: "viewOnly", label: "View only" },
];

function stateForRoute(state: PreviewState, route: PreviewRoute): PreviewState {
  if (route === "all") return { ...state, route, scenario: "default" };
  const definition = PREVIEW_ROUTE_REGISTRY[route];
  return {
    ...state,
    route,
    scenario: definition.defaultScenario,
    wallet: definition.wallets.includes(state.wallet)
      ? state.wallet
      : definition.wallets[0],
    frame: route === "onboarding" ? "fullscreen" : state.frame,
  };
}

function Frame({
  state,
  title,
}: {
  state: PreviewState;
  title: string;
}) {
  const frame = FRAME_MODES.find((item) => item.id === state.frame) ?? FRAME_MODES[0];
  const src = previewStateUrl(state, { canvas: true });

  return (
    <VStack align="stretch" spacing={2}>
      <HStack px={1}>
        <Text fontSize="xs" fontWeight="700" color="fg.secondary">
          {title}
        </Text>
        <Badge variant="info">{PREVIEW_ROUTE_REGISTRY[state.route as Exclude<PreviewRoute, "all">]?.fidelity}</Badge>
        <Spacer />
        <Badge variant="info">{frame.label}</Badge>
      </HStack>
      <Box
        w={frame.width}
        h={frame.height}
        overflow="hidden"
        bg="surface.base"
        border="1px solid"
        borderColor="border.strong"
      >
        <Box
          as="iframe"
          key={src}
          title={`${title} ${frame.label} preview`}
          src={src}
          w="100%"
          h="100%"
          display="block"
          border="0"
        />
      </Box>
    </VStack>
  );
}

export default function PreviewApp() {
  const parsed = useMemo(() => parsePreviewState(window.location.href), []);
  const [state, setState] = useState<PreviewState>(parsed.state);
  const { setThemeId } = useTheme();

  if (parsed.canvas && state.route !== "all") {
    return (
      <Box w="100%" h="100%" minH={0} overflow="hidden" bg="surface.base">
        <PreviewScreen
          route={state.route}
          mode={state.frame}
          scenario={state.scenario}
          wallet={state.wallet}
        />
      </Box>
    );
  }

  const commitState = (
    next: PreviewState,
    historyMode: "push" | "replace" = "replace",
  ) => {
    setState(next);
    window.history[historyMode === "push" ? "pushState" : "replaceState"](
      null,
      "",
      previewStateUrl(next),
    );
  };

  const go = (route: PreviewRoute) => {
    commitState(stateForRoute(state, route), "push");
  };

  const currentDefinition =
    state.route === "all" ? null : PREVIEW_ROUTE_REGISTRY[state.route];

  return (
    <Box minH="100vh" bg="surface.base" color="fg.primary" px={5} py={4}>
      <VStack align="stretch" spacing={4}>
        <HStack spacing={3} flexWrap="wrap">
          <Text fontSize="lg" fontWeight="900">
            Extension Preview
          </Text>
          <Badge variant="info">isolated viewport</Badge>
          <Spacer />
          <HStack spacing={1} flexWrap="wrap">
            {themeList.map((theme) => (
              <Button
                key={theme.id}
                size="xs"
                variant={theme.id === state.theme ? "primary" : "secondary"}
                onClick={() => {
                  void setThemeId(theme.id);
                  commitState({ ...state, theme: theme.id });
                }}
                leftIcon={theme.id === state.theme ? <CheckIcon /> : undefined}
              >
                {theme.name}
              </Button>
            ))}
          </HStack>
        </HStack>

        {parsed.warnings.length > 0 && (
          <HStack
            bg="status.warning.tint"
            color="status.warning.fg"
            border="1px solid"
            borderColor="status.warning.border"
            px={3}
            py={2}
            align="start"
          >
            <WarningTwoIcon mt="2px" />
            <Text fontSize="xs">{parsed.warnings.join(" · ")}</Text>
          </HStack>
        )}

        <HStack spacing={2} flexWrap="wrap">
          {PREVIEW_ROUTES.map((route) => (
            <Button
              key={route}
              size="xs"
              variant={route === state.route ? "highlight" : "secondary"}
              onClick={() => go(route)}
            >
              {PREVIEW_ROUTE_REGISTRY[route].label}
            </Button>
          ))}
          <Button
            size="xs"
            variant={state.route === "all" ? "highlight" : "secondary"}
            onClick={() => go("all")}
          >
            All
          </Button>
        </HStack>

        <HStack spacing={2} flexWrap="wrap">
          {FRAME_MODES.map((item) => (
            <Button
              key={item.id}
              size="xs"
              variant={item.id === state.frame ? "primary" : "secondary"}
              onClick={() => commitState({ ...state, frame: item.id })}
            >
              {item.label}
            </Button>
          ))}
          <Spacer />
          <Select
            aria-label="Preview wallet type"
            size="sm"
            w="150px"
            value={state.wallet}
            onChange={(event) =>
              commitState({
                ...state,
                wallet: event.target.value as PreviewWalletType,
              })
            }
          >
            {WALLET_TYPES.filter(
              (wallet) => !currentDefinition || currentDefinition.wallets.includes(wallet.id),
            ).map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.label}
              </option>
            ))}
          </Select>
          {currentDefinition && currentDefinition.scenarios.length > 1 && (
            <Select
              aria-label="Preview scenario"
              size="sm"
              w="180px"
              value={state.scenario}
              onChange={(event) =>
                commitState({ ...state, scenario: event.target.value })
              }
            >
              {currentDefinition.scenarios.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {scenario}
                </option>
              ))}
            </Select>
          )}
        </HStack>

        {state.route === "all" ? (
          <SimpleGrid minChildWidth="500px" spacing={5} alignItems="start">
            {PREVIEW_ROUTES.map((route) => {
              const routeState = stateForRoute(state, route);
              return (
                <Frame
                  key={`${route}-${state.theme}-${state.frame}-${routeState.wallet}`}
                  state={routeState}
                  title={PREVIEW_ROUTE_REGISTRY[route].label}
                />
              );
            })}
          </SimpleGrid>
        ) : (
          <Frame state={state} title={PREVIEW_ROUTE_REGISTRY[state.route].label} />
        )}
      </VStack>
    </Box>
  );
}

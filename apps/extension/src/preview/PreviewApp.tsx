import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  SimpleGrid,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import { themeList, useTheme } from "@/theme";
import { PreviewScreen } from "./PreviewScreens";
import type { FrameMode, PreviewRoute } from "./types";

const ROUTES: Array<{ id: PreviewRoute; label: string }> = [
  { id: "home", label: "Home" },
  { id: "unlock", label: "Unlock" },
  { id: "tx", label: "Tx" },
  { id: "signature", label: "Signature" },
  { id: "settings", label: "Settings" },
  { id: "portfolio", label: "Portfolio" },
  { id: "batch", label: "Batch" },
  { id: "cross-batch", label: "Cross batch" },
  { id: "all", label: "All" },
];

const FRAME_MODES: Array<{ id: FrameMode; label: string; width: number; height: number }> = [
  { id: "popup", label: "360x600", width: 360, height: 600 },
  { id: "window", label: "480x720", width: 480, height: 720 },
  { id: "sidepanel", label: "420x760", width: 420, height: 760 },
];

function routeFromLocation(): PreviewRoute {
  const slug = window.location.pathname.split("/").filter(Boolean).pop();
  if (ROUTES.some((route) => route.id === slug)) return slug as PreviewRoute;
  return "all";
}

function Frame({
  title,
  mode,
  children,
}: {
  title: string;
  mode: FrameMode;
  children: ReactNode;
}) {
  const frame = FRAME_MODES.find((item) => item.id === mode) ?? FRAME_MODES[0];
  return (
    <VStack align="stretch" spacing={2}>
      <HStack px={1}>
        <Text fontSize="xs" fontWeight="700" color="fg.secondary">
          {title}
        </Text>
        <Spacer />
        <Badge variant="info">{frame.label}</Badge>
      </HStack>
      <Box
        w={`${frame.width}px`}
        h={`${frame.height}px`}
        overflow="hidden"
        bg="surface.base"
        border="1px solid"
        borderColor="border.strong"
        borderRadius="14px"
        boxShadow="modal"
      >
        <Box w="100%" h="100%" overflowY="auto">
          {children}
        </Box>
      </Box>
    </VStack>
  );
}

export default function PreviewApp() {
  const [route, setRoute] = useState<PreviewRoute>(() => routeFromLocation());
  const [frameMode, setFrameMode] = useState<FrameMode>("popup");
  const { themeId, setThemeId } = useTheme();

  const previewRoutes = useMemo(
    () => ROUTES.filter((item) => item.id !== "all").map((item) => item.id),
    [],
  );

  const go = (next: PreviewRoute) => {
    setRoute(next);
    window.history.pushState(null, "", `/preview/${next}`);
  };

  return (
    <Box minH="100vh" bg="surface.base" color="fg.primary" px={5} py={4}>
      <VStack align="stretch" spacing={4}>
        <HStack spacing={3} flexWrap="wrap">
          <Text fontSize="lg" fontWeight="900">
            Extension Preview
          </Text>
          <Spacer />
          <HStack spacing={1} flexWrap="wrap">
            {themeList.map((theme) => (
              <Button
                key={theme.id}
                size="xs"
                variant={theme.id === themeId ? "primary" : "secondary"}
                onClick={() => void setThemeId(theme.id)}
                leftIcon={theme.id === themeId ? <CheckIcon /> : undefined}
              >
                {theme.name}
              </Button>
            ))}
          </HStack>
        </HStack>

        <HStack spacing={2} flexWrap="wrap">
          {ROUTES.map((item) => (
            <Button
              key={item.id}
              size="xs"
              variant={item.id === route ? "highlight" : "secondary"}
              onClick={() => go(item.id)}
            >
              {item.label}
            </Button>
          ))}
          <Spacer />
          {FRAME_MODES.map((item) => (
            <Button
              key={item.id}
              size="xs"
              variant={item.id === frameMode ? "primary" : "secondary"}
              onClick={() => setFrameMode(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </HStack>

        {route === "all" ? (
          <SimpleGrid minChildWidth="380px" spacing={5} alignItems="start">
            {previewRoutes.map((item) => (
              <Frame key={item} title={ROUTES.find((routeItem) => routeItem.id === item)?.label ?? item} mode={frameMode}>
                <PreviewScreen route={item} go={go} mode={frameMode} />
              </Frame>
            ))}
          </SimpleGrid>
        ) : (
          <Frame title={ROUTES.find((item) => item.id === route)?.label ?? route} mode={frameMode}>
            <PreviewScreen route={route} go={go} mode={frameMode} />
          </Frame>
        )}
      </VStack>
    </Box>
  );
}

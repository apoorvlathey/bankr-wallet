"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Box, HStack, VStack, Text } from "@chakra-ui/react";
import { useDesktopState } from "./useDesktopState";
import { DesktopIcon } from "./DesktopIcon";
import { Win95Window } from "./Win95Window";
import { MenuBar } from "./MenuBar";
import { Taskbar } from "./Taskbar";
import { AppStoreContent } from "./AppStoreContent";
import { SwapWchanPanel } from "./SwapWchanPanel";
import { StakingPanel } from "./StakingPanel";
import { IframeContent } from "../components/IframeContent";
import { AboutDialog } from "./AboutDialog";
import { ContextMenu, type ContextMenuAction } from "./ContextMenu";
import { WalletChanMascot } from "./WalletChanMascot";
import { APP_STORE_WINDOW_ID, SWAP_WINDOW_ID, STAKE_WINDOW_ID, WIDGET_STORE_WINDOW_ID } from "./types";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetStoreContent } from "./WidgetStoreContent";
import { getWidgetType } from "./widgetRegistry";
import { DAPPS, CHAIN_NAMES } from "../data/dapps";
import { DESKTOP_BG, TASKBAR_HEIGHT, MENUBAR_HEIGHT } from "./win95styles";
import { useVaultData } from "../../contexts/VaultDataContext";
import { usePremiumStatus } from "./usePremiumStatus";

export function Desktop() {
  const {
    windows,
    focusedWindowId,
    installedDapps,
    openWindow,
    openCustomUrl,
    openAppStore,
    openSystemWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    updateWindowPosition,
    updateWindowSize,
    switchWindowChain,
    installApp,
    uninstallApp,
    isInstalled,
    reorderApps,
    customApps,
    installCustomApp,
    uninstallCustomApp,
    isCustomAppInstalled,
    widgets,
    addWidget,
    removeWidget,
    updateWidgetPosition,
    updateWidgetSize,
    updateWidgetConfig,
    focusWidget,
    openWidgetStore,
  } = useDesktopState();

  const { vaultData } = useVaultData();
  const { isPremium, isLoading: isLoadingPremium } = usePremiumStatus();

  const handleOpenStake = useCallback(() => {
    openSystemWindow(STAKE_WINDOW_ID);
  }, [openSystemWindow]);

  const [selectedIconId, setSelectedIconId] = useState<number | string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragFromIndex = useRef<number | null>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const [desktopSize, setDesktopSize] = useState({ width: 0, height: 0 });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    actions: ContextMenuAction[];
  } | null>(null);

  // Track desktop area size for window bounds
  useEffect(() => {
    const updateSize = () => {
      if (desktopRef.current) {
        const rect = desktopRef.current.getBoundingClientRect();
        setDesktopSize({
          width: rect.width,
          height: rect.height - MENUBAR_HEIGHT - TASKBAR_HEIGHT,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Detect iframe focus: when user clicks inside an iframe, the parent window
  // loses focus. We use this to identify which window's iframe was clicked and
  // bring that window to the front.
  useEffect(() => {
    const handleBlur = () => {
      // After a brief delay, check which iframe has focus
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl?.tagName === "IFRAME") {
          // Walk up to find the Rnd wrapper with a data-window-id or data-widget-id
          let el: HTMLElement | null = activeEl as HTMLElement;
          while (el && !el.dataset?.windowId && !el.dataset?.widgetId) {
            el = el.parentElement;
          }
          if (el?.dataset?.windowId) {
            focusWindow(el.dataset.windowId);
          } else if (el?.dataset?.widgetId) {
            focusWidget(el.dataset.widgetId);
          }
        }
      }, 0);
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [focusWindow, focusWidget]);

  // Deselect icon when clicking on desktop background
  const handleDesktopClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === desktopRef.current || (e.target as HTMLElement).dataset?.desktopBg) {
        setSelectedIconId(null);
      }
    },
    []
  );

  // Right-click context menu on desktop background
  const handleDesktopContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Only show on desktop background, not on icons or windows
      const target = e.target as HTMLElement;
      if (target === desktopRef.current || target.dataset?.desktopBg) {
        e.preventDefault();
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          actions: [
            {
              label: "App Store",
              icon: "/images/walletchan-icon-nobg.png",
              onClick: openAppStore,
              dividerAfter: true,
            },
            {
              label: "About WalletChan",
              onClick: () => setAboutOpen(true),
            },
          ],
        });
      }
    },
    [openAppStore]
  );

  // Right-click context menu on a desktop icon
  const handleIconContextMenu = useCallback(
    (e: React.MouseEvent, dappId: number) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        actions: [
          {
            label: "Open",
            onClick: () => openWindow(dappId),
            dividerAfter: true,
          },
          {
            label: "Uninstall",
            onClick: () => uninstallApp(dappId),
            danger: true,
          },
        ],
      });
    },
    [openWindow, uninstallApp]
  );

  // Handle taskbar window button click (toggle minimize / focus)
  const handleWindowButtonClick = useCallback(
    (id: string) => {
      const win = windows.find((w) => w.id === id);
      if (!win) return;

      if (win.isMinimized) {
        focusWindow(id);
      } else if (id === focusedWindowId) {
        minimizeWindow(id);
      } else {
        focusWindow(id);
      }
    },
    [windows, focusedWindowId, focusWindow, minimizeWindow]
  );

  return (
    <Box
      ref={desktopRef}
      position="relative"
      flex={1}
      bgImage={DESKTOP_BG}
      overflow="hidden"
      display="flex"
      flexDirection="column"
      onClick={handleDesktopClick}
      onContextMenu={handleDesktopContextMenu}
    >
      {/* macOS-style menu bar */}
      <MenuBar
        onOpenSwap={() => openSystemWindow(SWAP_WINDOW_ID)}
        isPremium={isPremium}
        isLoadingPremium={isLoadingPremium}
        onOpenStake={handleOpenStake}
      />

      {/* Desktop area below menu bar */}
      <Box
        position="relative"
        flex={1}
        display="flex"
        flexDirection="column"
        overflow="hidden"
        // Bauhaus geometric wallpaper overlay
        _before={{
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: `
            radial-gradient(ellipse 600px 600px at 10% 90%, rgba(16, 64, 192, 0.12), transparent),
            radial-gradient(ellipse 500px 500px at 85% 20%, rgba(208, 32, 32, 0.08), transparent),
            radial-gradient(ellipse 400px 400px at 50% 50%, rgba(240, 192, 32, 0.06), transparent),
            radial-gradient(circle at 20% 30%, rgba(16, 64, 192, 0.15) 1.5px, transparent 1.5px),
            radial-gradient(circle at 60% 15%, rgba(208, 32, 32, 0.12) 2px, transparent 2px),
            radial-gradient(circle at 80% 70%, rgba(240, 192, 32, 0.1) 1.5px, transparent 1.5px),
            radial-gradient(circle at 40% 80%, rgba(16, 64, 192, 0.1) 1px, transparent 1px),
            radial-gradient(circle at 90% 40%, rgba(208, 32, 32, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 100% 100%, 180px 180px, 220px 220px, 160px 160px, 140px 140px, 200px 200px",
          pointerEvents: "none",
        }}
        _after={{
          content: '""',
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage: `
            linear-gradient(45deg, transparent 48%, rgba(255,255,255,0.5) 49%, rgba(255,255,255,0.5) 51%, transparent 52%),
            linear-gradient(-45deg, transparent 48%, rgba(255,255,255,0.3) 49%, rgba(255,255,255,0.3) 51%, transparent 52%)
          `,
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }}
      >
      {/* Desktop icon area */}
      <Box
        data-desktop-bg="true"
        flex={1}
        position="relative"
        p={3}
        display="flex"
        flexWrap="wrap"
        alignContent="flex-start"
        gap={1}
        sx={{
          // Grid-like column layout (icons flow top-to-bottom, left-to-right)
          flexDirection: "column",
          maxH: `calc(100% - ${TASKBAR_HEIGHT}px)`,
        }}
      >
        {/* App Store icon — always first */}
        <DesktopIcon
          iconUrl="/images/walletchan-icon-nobg.png"
          label="App Store"
          isSelected={selectedIconId === -1}
          onSelect={() => setSelectedIconId(-1)}
          onOpen={openAppStore}
        />

        {/* Installed dapp icons */}
        {installedDapps.map((dapp, i) => (
          <Box
            key={dapp.id}
            onContextMenu={(e: React.MouseEvent) => handleIconContextMenu(e, dapp.id)}
          >
            <DesktopIcon
              iconUrl={dapp.iconUrl}
              label={dapp.name}
              isSelected={selectedIconId === dapp.id}
              onSelect={() => setSelectedIconId(dapp.id)}
              onOpen={() => openWindow(dapp.id)}
              autoConnect={dapp.autoConnect === true}
              index={i}
              draggable
              onDragStart={(idx) => { dragFromIndex.current = idx; }}
              onDragOver={(idx) => setDragOverIndex(idx)}
              onDragEnd={() => {
                if (dragFromIndex.current !== null && dragOverIndex !== null && dragFromIndex.current !== dragOverIndex) {
                  reorderApps(dragFromIndex.current, dragOverIndex);
                }
                dragFromIndex.current = null;
                setDragOverIndex(null);
              }}
              isDragOver={dragOverIndex === i}
            />
          </Box>
        ))}

        {/* Custom installed dapp icons */}
        {customApps.map((app) => (
          <Box
            key={app.url}
            onContextMenu={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                actions: [
                  {
                    label: "Open",
                    onClick: () => openCustomUrl(app.url, app.name),
                    dividerAfter: true,
                  },
                  {
                    label: "Uninstall",
                    onClick: () => uninstallCustomApp(app.url),
                    danger: true,
                  },
                ],
              });
            }}
          >
            <DesktopIcon
              iconUrl={app.iconUrl}
              label={app.name}
              isSelected={selectedIconId === app.url}
              onSelect={() => setSelectedIconId(app.url)}
              onOpen={() => openCustomUrl(app.url, app.name)}
            />
          </Box>
        ))}
      </Box>

      {/* Right-side system icons */}
      <HStack
        position="absolute"
        right={3}
        top={3}
        spacing={3}
        align="start"
        zIndex={1}
      >
        <DesktopIcon
          iconUrl="/images/walletchan-icon-nobg.png"
          label="Swap WCHAN"
          iconBg="#F0C020"
          isSelected={selectedIconId === SWAP_WINDOW_ID}
          onSelect={() => setSelectedIconId(SWAP_WINDOW_ID)}
          onOpen={() => openSystemWindow(SWAP_WINDOW_ID)}
        />
        <Box position="relative">
          {/* APY badge (like navbar) */}
          {vaultData && vaultData.totalApy > 0 && (
            <Box
              position="absolute"
              top="2px"
              left="50%"
              transform="translateX(-50%)"
              bg="bauhaus.yellow"
              border="1.5px solid"
              borderColor="bauhaus.black"
              px={1.5}
              py={0}
              lineHeight="1.3"
              whiteSpace="nowrap"
              zIndex={2}
              pointerEvents="none"
            >
              <Text
                fontSize="7px"
                fontWeight="900"
                color="bauhaus.black"
                letterSpacing="wide"
              >
                {vaultData.totalApy.toFixed(1)}% APY
              </Text>
            </Box>
          )}
          <DesktopIcon
            iconUrl="/images/walletchan-icon-nobg.png"
            label="Stake"
            iconBg="#1040C0"
            isSelected={selectedIconId === STAKE_WINDOW_ID}
            onSelect={() => setSelectedIconId(STAKE_WINDOW_ID)}
            onOpen={() => openSystemWindow(STAKE_WINDOW_ID)}
          />
        </Box>
      </HStack>

      {/* Windows layer */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={`${TASKBAR_HEIGHT}px`}
        pointerEvents="none"
      >
        <Box position="relative" w="100%" h="100%" sx={{ "& > *": { pointerEvents: "auto" } }}>
          {/* Widgets — only rendered for premium stakers */}
          {isPremium && widgets.map((widget) => {
            const widgetDef = getWidgetType(widget.type);
            if (!widgetDef) return null;
            return (
              <WidgetFrame
                key={widget.id}
                widget={widget}
                widgetDef={widgetDef}
                isFocused={false}
                onFocus={() => focusWidget(widget.id)}
                onClose={() => removeWidget(widget.id)}
                onDragStop={(pos) => updateWidgetPosition(widget.id, pos)}
                onResizeStop={(size, pos) => updateWidgetSize(widget.id, size, pos)}
                onSaveConfig={(config) => updateWidgetConfig(widget.id, config)}
              />
            );
          })}

          {/* Windows */}
          {windows.map((win) => {
            const dapp = win.dappId
              ? DAPPS.find((d) => d.id === win.dappId) ?? null
              : null;

            // Determine install state for the window
            const winInstalled = dapp
              ? isInstalled(dapp.id)
              : win.customUrl
                ? isCustomAppInstalled(win.customUrl)
                : undefined;
            const winOnInstall = dapp
              ? () => installApp(dapp.id)
              : win.customUrl
                ? () => installCustomApp(win.customUrl!, win.customName)
                : undefined;

            return (
              <Win95Window
                key={win.id}
                windowState={win}
                dapp={dapp}
                isFocused={win.id === focusedWindowId}
                desktopBounds={desktopSize}
                onFocus={() => focusWindow(win.id)}
                onClose={() => closeWindow(win.id)}
                onMinimize={() => minimizeWindow(win.id)}
                onMaximize={() => maximizeWindow(win.id)}
                onDragStop={(pos) => updateWindowPosition(win.id, pos)}
                onResizeStop={(size, pos) =>
                  updateWindowSize(win.id, size, pos)
                }
                onChainChange={(chainId) => switchWindowChain(win.id, chainId)}
                isInstalled={winInstalled}
                onInstall={winOnInstall}
              >
                {win.id === APP_STORE_WINDOW_ID ? (
                  <AppStoreContent
                    isInstalled={isInstalled}
                    onInstall={installApp}
                    onUninstall={uninstallApp}
                    onOpenDapp={(dappId) => {
                      installApp(dappId);
                      openWindow(dappId);
                    }}
                    onOpenCustomUrl={openCustomUrl}
                    isCustomAppInstalled={isCustomAppInstalled}
                    onInstallCustomApp={installCustomApp}
                    onUninstallCustomApp={uninstallCustomApp}
                  />
                ) : win.id === WIDGET_STORE_WINDOW_ID ? (
                  <WidgetStoreContent onAddWidget={addWidget} isPremium={isPremium} onOpenStake={handleOpenStake} />
                ) : win.id === SWAP_WINDOW_ID ? (
                  <SwapWchanPanel />
                ) : win.id === STAKE_WINDOW_ID ? (
                  <StakingPanel />
                ) : (
                  <IframeContent
                    appUrl={dapp?.url ?? win.customUrl ?? ""}
                    appName={dapp?.name ?? win.customName ?? "Browser"}
                    activeChainId={win.chainId}
                    supportedChains={
                      dapp?.chains ?? Object.keys(CHAIN_NAMES).map(Number)
                    }
                    autoConnect={dapp?.autoConnect}
                    onChainChange={(chainId) =>
                      switchWindowChain(win.id, chainId)
                    }
                  />
                )}
              </Win95Window>
            );
          })}
        </Box>
      </Box>

      {/* Mascot */}
      <WalletChanMascot />

      {/* Taskbar */}
      <Taskbar
        windows={windows}
        focusedWindowId={focusedWindowId}
        onStartClick={openAppStore}
        onWindowButtonClick={handleWindowButtonClick}
        onOpenAbout={() => setAboutOpen(true)}
        onOpenApp={openWindow}
        installedApps={installedDapps.map((d) => ({ id: d.id, name: d.name, iconUrl: d.iconUrl }))}
        onOpenWidgetStore={openWidgetStore}
      />
      </Box>

      {/* About Dialog */}
      <AboutDialog isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </Box>
  );
}

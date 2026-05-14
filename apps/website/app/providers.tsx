"use client";

import { ChakraProvider } from "@chakra-ui/react";
import theme from "@/theme";
import { TokenDataProvider } from "./contexts/TokenDataContext";
import { VaultDataProvider } from "./contexts/VaultDataContext";

import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { config, setGlobalOpenImpersonatorModal } from "./wagmiConfig";
import {
  useImpersonatorModal,
  ImpersonatorFloatingButton,
} from "./utils/impersonatorConnector";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const { openModal, ModalComponent } = useImpersonatorModal();

  // Set the global modal opener function
  setGlobalOpenImpersonatorModal(openModal);

  return (
    <ChakraProvider theme={theme}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider modalSize="compact" theme={darkTheme()}>
            <TokenDataProvider>
              <VaultDataProvider>{children}</VaultDataProvider>
            </TokenDataProvider>
            <ModalComponent />
            <ImpersonatorFloatingButton />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ChakraProvider>
  );
}

import type { ReactNode } from "react";
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
import { CopyIcon } from "@chakra-ui/icons";
import { ThemedCard } from "@/theme";
import UnlockScreen from "@/components/UnlockScreen";
import TransactionConfirmation from "@/components/TransactionConfirmation";
import SignatureRequestConfirmation from "@/components/SignatureRequestConfirmation";
import BatchTransactionConfirmation from "@/components/BatchTransactionConfirmation";
import CrossDappBatchConfirmation from "@/components/CrossDappBatchConfirmation";
import Erc7715PermissionConfirmation from "@/components/Erc7715PermissionConfirmation";
import AppearanceSettings from "@/components/Settings/AppearanceSettings";
import PreviewHome from "./PreviewHome";
import {
  previewBatchRequest,
  previewCrossDappBatch,
  previewPermissionRequest,
  previewSignatureRequest,
  previewTxRequest,
} from "./fixtures";
import type { FrameMode, PreviewRoute } from "./types";

function PreviewShell({ children }: { children: ReactNode }) {
  return (
    <Box minH="100%" bg="surface.base" color="fg.primary">
      {children}
    </Box>
  );
}

function PortfolioPreview() {
  return (
    <PreviewShell>
      <VStack spacing={3} align="stretch" p={4}>
        <HStack>
          <Text fontSize="lg" fontWeight="900">
            Portfolio
          </Text>
          <Spacer />
          <Button size="xs" variant="secondary" leftIcon={<CopyIcon />}>
            Copy
          </Button>
        </HStack>
        <ThemedCard p={4}>
          <HStack align="end">
            <VStack align="start" spacing={1}>
              <Text fontSize="xs" color="fg.muted" fontWeight="700">
                Net worth
              </Text>
              <Text fontSize="3xl" fontWeight="900" lineHeight="1">
                $24.7K
              </Text>
            </VStack>
            <Spacer />
            <Badge variant="success">+$982 today</Badge>
          </HStack>
          <HStack mt={5} h="96px" align="end" spacing={1.5}>
            {[36, 42, 30, 58, 64, 50, 74, 86, 70, 92, 88, 100].map((height, index) => (
              <Box
                key={index}
                flex={1}
                h={`${height}%`}
                borderRadius="sm"
                bg={index > 8 ? "accent.secondary" : "surface.raisedHover"}
              />
            ))}
          </HStack>
        </ThemedCard>
        <SimpleGrid columns={2} spacing={2}>
          {[
            ["Base", "$18,210", "73.8%"],
            ["Ethereum", "$4,982", "20.2%"],
            ["Polygon", "$1,104", "4.5%"],
            ["Unichain", "$385", "1.5%"],
          ].map(([name, value, pct]) => (
            <ThemedCard key={name} p={3}>
              <Text fontSize="xs" color="fg.muted" fontWeight="700">
                {name}
              </Text>
              <Text fontSize="lg" fontWeight="900">
                {value}
              </Text>
              <Text fontSize="xs" color="fg.secondary">
                {pct}
              </Text>
            </ThemedCard>
          ))}
        </SimpleGrid>
      </VStack>
    </PreviewShell>
  );
}

function SettingsPreview() {
  return (
    <PreviewShell>
      <Box p={4}>
        <AppearanceSettings onCancel={() => {}} />
      </Box>
    </PreviewShell>
  );
}

export function PreviewScreen({
  route,
  go,
  mode,
}: {
  route: PreviewRoute;
  go: (route: PreviewRoute) => void;
  mode: FrameMode;
}) {
  const noop = () => {};

  switch (route) {
    case "home":
      return <PreviewHome go={go} />;
    case "unlock":
      return (
        <PreviewShell>
          <UnlockScreen
            onUnlock={noop}
            pendingTxCount={1}
            pendingSignatureCount={1}
            pendingBatchCount={1}
            pendingPermissionCount={1}
          />
        </PreviewShell>
      );
    case "tx":
      return (
        <PreviewShell>
          <TransactionConfirmation
            txRequest={previewTxRequest}
            currentIndex={0}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType="bankr"
            onBack={noop}
            onConfirmed={noop}
            onRejected={noop}
            onRejectAll={noop}
            onNavigate={noop}
            crossDappBatch={previewCrossDappBatch}
            onAddedToBatch={noop}
          />
        </PreviewShell>
      );
    case "signature":
      return (
        <PreviewShell>
          <SignatureRequestConfirmation
            sigRequest={previewSignatureRequest}
            currentIndex={1}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType="bankr"
            onBack={noop}
            onCancelled={noop}
            onCancelAll={noop}
            onNavigate={noop}
            onConfirmed={noop}
          />
        </PreviewShell>
      );
    case "settings":
      return <SettingsPreview />;
    case "portfolio":
      return <PortfolioPreview />;
    case "batch":
      return (
        <PreviewShell>
          <BatchTransactionConfirmation
            batchRequest={previewBatchRequest}
            currentIndex={2}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType="bankr"
            accountAddress={previewTxRequest.tx.from}
            onBack={noop}
            onConfirmed={noop}
            onRejected={noop}
            onRejectAll={noop}
            onNavigate={noop}
            crossDappBatch={previewCrossDappBatch}
            onAddedToBatch={noop}
          />
        </PreviewShell>
      );
    case "cross-batch":
      return (
        <PreviewShell>
          <CrossDappBatchConfirmation
            batch={previewCrossDappBatch}
            currentIndex={3}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            onBack={noop}
            onConfirmed={noop}
            onRejected={noop}
            onNavigate={noop}
          />
        </PreviewShell>
      );
    case "permission":
      return (
        <PreviewShell>
          <Erc7715PermissionConfirmation
            permissionRequest={previewPermissionRequest}
            currentIndex={4}
            totalCount={5}
            isInSidePanel={mode === "sidepanel"}
            accountType="privateKey"
            onBack={noop}
            onConfirmed={noop}
            onCancelled={noop}
            onCancelAll={noop}
            onNavigate={noop}
          />
        </PreviewShell>
      );
    case "all":
      return null;
  }
}

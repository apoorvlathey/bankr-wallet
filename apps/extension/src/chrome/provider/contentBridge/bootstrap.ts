import { startGatewayMetadataCapture } from "./gatewayMetadata";
import { initializeInpageProvider } from "./initialization";
import { installPageToRuntimeBridge } from "./pageRouter";
import { installRuntimeToPageForwarding } from "./runtimeForwarding";

export function startProviderContentBridge(): void {
  startGatewayMetadataCapture();
  installRuntimeToPageForwarding();
  installPageToRuntimeBridge();
  void initializeInpageProvider();
}

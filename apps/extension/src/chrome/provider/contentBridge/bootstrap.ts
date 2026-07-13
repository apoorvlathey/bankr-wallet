import { startGatewayMetadataCapture } from "./gatewayMetadata";
import { initializeInpageProvider } from "./initialization";
import { installPageToRuntimeBridge } from "./pageRouter";
import { startProviderRequestSurfaceTracking } from "./requestSurface";
import { installRuntimeToPageForwarding } from "./runtimeForwarding";

export function startProviderContentBridge(): void {
  startGatewayMetadataCapture();
  installRuntimeToPageForwarding();
  startProviderRequestSurfaceTracking();
  installPageToRuntimeBridge();
  void initializeInpageProvider();
}

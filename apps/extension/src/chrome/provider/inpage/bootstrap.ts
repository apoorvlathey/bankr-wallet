import { installDappRpcDiscovery } from "../../dapp/rpcForwarding";
import { installProviderAnnouncementListener } from "./announcement";
import { installContentResultRouter } from "./resultRouter";

export function startInpageProvider(): void {
  installDappRpcDiscovery();
  installProviderAnnouncementListener();
  installContentResultRouter();
}

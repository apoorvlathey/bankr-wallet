import { hexValue } from "@ethersproject/bytes";
import {
  requestAddEthereumChain,
  requestDappAccounts,
  requestSignature,
  requestSwitchEthereumChain,
  requestWatchAsset,
} from "./accountChainRequests";
import {
  requestCallsStatus,
  requestCapabilities,
  requestSendCalls,
  showCallsStatus,
} from "./erc5792Adapter";
import { requestExecutionPermissions } from "./executionPermissionAdapter";
import type { ProviderRequestContext } from "./requestContext";
import { requestTransaction } from "./transactionAdapter";

export async function routeProviderRequest(
  context: ProviderRequestContext,
  method: string,
  params: any[] = [],
): Promise<any> {
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts":
      return requestDappAccounts(method);
    case "net_version":
      return context.chainId;
    case "eth_chainId":
      return hexValue(context.chainId);
    case "wallet_addEthereumChain":
      return requestAddEthereumChain(context, params);
    case "wallet_switchEthereumChain":
      return requestSwitchEthereumChain(context, params);
    case "eth_sign":
    case "personal_sign":
    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
      return requestSignature(context, method, params);
    case "wallet_watchAsset":
      return requestWatchAsset(context, params);
    case "wallet_getCapabilities":
      return requestCapabilities(context, params);
    case "wallet_sendCalls":
      return requestSendCalls(params);
    case "wallet_getCallsStatus":
      return requestCallsStatus(params);
    case "wallet_showCallsStatus":
      return showCallsStatus(params);
    case "wallet_getSupportedExecutionPermissions":
    case "wallet_getGrantedExecutionPermissions":
    case "wallet_requestExecutionPermissions":
      return requestExecutionPermissions(context, method, params);
    case "eth_sendTransaction":
      return requestTransaction(context, params);
    default:
      return context.rpc(method, params);
  }
}

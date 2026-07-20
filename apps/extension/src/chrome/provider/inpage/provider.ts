import { EventEmitter } from "events";
import { hexValue } from "@ethersproject/bytes";
import { DappRpcForwarder } from "../../dapp/rpcForwarding";
import { ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR } from "../../erc7715/requestLock";
import { makeProviderError } from "../errors";
import { isExecutionPermissionRequestInProgress } from "./pendingRequests";
import { requestRpcThroughContentScript } from "./rpcBridge";
import { routeProviderRequest } from "./requestRouter";

export const UNCONNECTED_PROVIDER_ADDRESS =
  "0x0000000000000000000000000000000000000000";
const EXPOSED_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;

export class ImpersonatorProvider extends EventEmitter {
  isImpersonator = true;
  isMetaMask = true;

  #address: string;
  private chainId: number;
  private dappRpcForwarder = new DappRpcForwarder();

  constructor(chainId: number, address: string) {
    super();
    this.chainId = chainId;
    this.#address = address;
  }

  /** MetaMask-compatible legacy view of the origin-authorized account. */
  get selectedAddress(): string | null {
    if (
      !EXPOSED_ADDRESS_PATTERN.test(this.#address) ||
      this.#address.toLowerCase() === UNCONNECTED_PROVIDER_ADDRESS
    ) {
      return null;
    }
    return this.#address;
  }

  setAddress = (address: string, emitAccountsChanged = true) => {
    this.#address = address;
    if (emitAccountsChanged) this.emit("accountsChanged", [address]);
  };

  emitConnected = () => {
    this.emit("connect", { chainId: hexValue(this.chainId) });
  };

  setChainId = (chainId: number) => {
    if (this.chainId === chainId) return;
    this.chainId = chainId;
    this.emit("chainChanged", hexValue(chainId));
  };

  private async rpc(method: string, params: any[] = []): Promise<any> {
    const discovered = await this.dappRpcForwarder.tryRequest(
      this.chainId,
      method,
      params,
    );
    return discovered.forwarded
      ? discovered.result
      : requestRpcThroughContentScript(method, params);
  }

  request(request: { method: string; params?: Array<any> }): Promise<any> {
    return this.send(request.method, request.params || []);
  }

  async send(method: string, params: Array<any> = []): Promise<any> {
    if (isExecutionPermissionRequestInProgress()) {
      throw makeProviderError(
        ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR,
        -32002,
      );
    }
    return routeProviderRequest(
      {
        chainId: this.chainId,
        address: this.#address,
        setChainId: this.setChainId,
        rpc: (rpcMethod, rpcParams = []) => this.rpc(rpcMethod, rpcParams),
      },
      method,
      params,
    );
  }
}

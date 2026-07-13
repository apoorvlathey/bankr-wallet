export interface ProviderRequestContext {
  chainId: number;
  address: string;
  setChainId(chainId: number): void;
  rpc(method: string, params?: any[]): Promise<any>;
}

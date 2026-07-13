import type { ImpersonatorProvider } from "./provider";

let providerInstance: ImpersonatorProvider | null = null;

export function getProviderInstance(): ImpersonatorProvider | null {
  return providerInstance;
}

export function setProviderInstance(provider: ImpersonatorProvider): void {
  providerInstance = provider;
}

/**
 * WalletChan does not expose WalletConnect Pay.
 *
 * WalletKit imports the optional Pay client unconditionally and probes its
 * static `isAvailable()` method during initialization. The upstream browser
 * implementation currently bundles dynamic-code and WebAssembly loaders that
 * are incompatible with the extension's strict MV3 content-security policy.
 *
 * The background-only Vite config aliases `@walletconnect/pay` to this module.
 * Keeping the same minimal export shape lets WalletKit initialize its signing
 * and session engine while making the unsupported Pay feature fail closed.
 */
export class WalletConnectPay {
  static isAvailable(): boolean {
    return false;
  }

  constructor() {
    throw new Error("WalletConnect Pay is unavailable in WalletChan");
  }
}

export default WalletConnectPay;

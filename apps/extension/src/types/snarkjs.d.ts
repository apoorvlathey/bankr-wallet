declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Readonly<Record<string, unknown>>,
      wasm: Uint8Array,
      zkey: Uint8Array,
      logger?: unknown,
      witnessOptions?: unknown,
      proverOptions?: { readonly singleThread?: boolean },
    ): Promise<{ proof: unknown; publicSignals: readonly string[] }>;
    verify(
      verificationKey: unknown,
      publicSignals: readonly string[],
      proof: unknown,
      logger?: unknown,
    ): Promise<boolean>;
  };

  export const curves: {
    getCurveFromName(
      name: string,
      options?: { readonly singleThread?: boolean },
    ): Promise<unknown>;
  };
}

declare module "qrcode-terminal" {
  interface GenerateOptions {
    small?: boolean;
  }

  interface QrCodeTerminal {
    generate(
      input: string,
      options?: GenerateOptions,
      callback?: (qr: string) => void,
    ): void;
  }

  const qrcode: QrCodeTerminal;
  export default qrcode;
}

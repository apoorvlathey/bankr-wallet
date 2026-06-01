declare module "qrcode" {
  interface ToDataUrlOptions {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    scale?: number;
    type?: "image/png";
  }

  interface QrCodeModule {
    toDataURL(input: string, options?: ToDataUrlOptions): Promise<string>;
  }

  const qrcode: QrCodeModule;
  export default qrcode;
}

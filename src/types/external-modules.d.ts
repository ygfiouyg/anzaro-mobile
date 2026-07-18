/**
 * تعريفات أنواع للمكتبات اللي ما معاهاش تعريفات رسمية.
 */

declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    color?: { dark?: string; light?: string };
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    type?: string;
    quality?: number;
  }
  export function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions,
  ): Promise<string>;
  export function toDataURL(text: string): Promise<string>;
  export function toString(text: string, options?: any): Promise<string>;
  const _default: {
    toDataURL: typeof toDataURL;
    toString: typeof toString;
  };
  export default _default;
}

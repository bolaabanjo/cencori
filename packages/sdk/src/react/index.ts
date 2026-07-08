/**
 * cencori/react — importable UI components for AI apps
 *
 * @example
 * import { VisionUploader } from 'cencori/react';
 *
 * <VisionUploader
 *     endpoint="https://api.cencori.com/api/ai/vision"
 *     apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY}
 *     task="describe"
 *     onResult={(result) => console.log(result)}
 * />
 */

export { VisionFormatBanner } from './vision/vision-format-banner';
export type { VisionFormatBannerProps, VisionProvider } from './vision/vision-format-banner';

export { VisionUploader } from './vision/vision-uploader';
export type { VisionUploaderProps, VisionTask } from './vision/vision-uploader';

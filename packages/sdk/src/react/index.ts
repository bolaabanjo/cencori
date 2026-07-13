/**
 * cencori/react — importable UI components for AI apps
 *
 * @example Memory-aware chat in two lines
 * import { Chat } from 'cencori/react';
 *
 * <Chat
 *     model="gpt-4o"
 *     apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY}
 *     memory={{ userId: session.user.id }}
 * />
 *
 * @example Vision uploader
 * import { VisionUploader } from 'cencori/react';
 *
 * <VisionUploader endpoint="https://api.cencori.com/api/ai/vision" task="describe" />
 */

// Memory-aware chat + memory hook
export { Chat } from './chat/chat';
export type { ChatProps, ChatMessage, ChatMemoryProp } from './chat/chat';

export { useMemory } from './memory/use-memory';
export type {
    UseMemoryOptions,
    UseMemoryResult,
    UserMemory,
    MemoryScope,
} from './memory/use-memory';

// Vision
export { VisionFormatBanner } from './vision/vision-format-banner';
export type { VisionFormatBannerProps, VisionProvider } from './vision/vision-format-banner';

export { VisionUploader } from './vision/vision-uploader';
export type { VisionUploaderProps, VisionTask } from './vision/vision-uploader';

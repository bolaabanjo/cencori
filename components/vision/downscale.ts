/**
 * Client-side image downscaling.
 *
 * Iteratively reduces JPEG/PNG/WEBP dimensions until the image fits under
 * `maxBytes`. Uses <canvas>, so it must run in the browser. GIF, HEIC, and
 * HEIF are not downscaled — the caller should reject those with a format error.
 */

const DOWNSCALABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function canDownscale(mimeType: string): boolean {
    return DOWNSCALABLE_TYPES.has(mimeType.toLowerCase());
}

export interface DownscaleResult {
    file: File;
    originalBytes: number;
    finalBytes: number;
    steps: number;
}

export async function downscaleImage(
    file: File,
    maxBytes: number,
    options: { minDimension?: number; qualityFloor?: number } = {}
): Promise<DownscaleResult> {
    const originalBytes = file.size;
    if (originalBytes <= maxBytes) {
        return { file, originalBytes, finalBytes: originalBytes, steps: 0 };
    }
    if (!canDownscale(file.type)) {
        throw new Error(`Cannot auto-compress ${file.type}. Please upload a smaller image.`);
    }

    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const minDim = options.minDimension ?? 320;
    let quality = 0.9;
    const qFloor = options.qualityFloor ?? 0.5;
    // Re-encode to JPEG unless PNG has transparency we should preserve. Simpler: always JPEG for compression.
    const outputType = 'image/jpeg';

    let steps = 0;
    let bytes = originalBytes;
    let outFile = file;

    while (bytes > maxBytes && steps < 8) {
        steps += 1;
        // Prefer reducing dimensions first (bigger win), then quality
        if (Math.min(width, height) > minDim && steps <= 4) {
            width = Math.floor(width * 0.75);
            height = Math.floor(height * 0.75);
        } else if (quality > qFloor) {
            quality = Math.max(qFloor, quality - 0.15);
        } else {
            break;
        }

        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(width, height)
            : Object.assign(document.createElement('canvas'), { width, height });

        const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        (ctx as CanvasRenderingContext2D).drawImage(bitmap, 0, 0, width, height);

        const blob = canvas instanceof OffscreenCanvas
            ? await canvas.convertToBlob({ type: outputType, quality })
            : await new Promise<Blob>((resolve, reject) => {
                (canvas as HTMLCanvasElement).toBlob(
                    (b) => b ? resolve(b) : reject(new Error('toBlob returned null')),
                    outputType,
                    quality,
                );
            });

        bytes = blob.size;
        outFile = new File([blob], renameToJpeg(file.name), { type: outputType, lastModified: Date.now() });
    }

    bitmap.close?.();

    if (bytes > maxBytes) {
        throw new Error(`Could not compress image below the ${(maxBytes / (1024 * 1024)).toFixed(1)}MB limit.`);
    }

    return { file: outFile, originalBytes, finalBytes: bytes, steps };
}

function renameToJpeg(name: string): string {
    const dot = name.lastIndexOf('.');
    if (dot === -1) return `${name}.jpg`;
    return `${name.slice(0, dot)}.jpg`;
}

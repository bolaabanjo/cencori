/**
 * Voice Catalog API Route
 *
 * GET /api/ai/audio/voices
 *
 * Runtime voice discovery: returns the full TTS model/voice registry so
 * clients can fetch voice ids and per-model defaults instead of hardcoding
 * them. Mirrors the `models` payload of GET /api/ai/audio/speech.
 */

import { NextResponse } from 'next/server';
import { listVoiceModels } from '@/lib/audio/speech';

export async function GET() {
    return NextResponse.json({
        models: listVoiceModels(),
    });
}
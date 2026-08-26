/**
 * Shared constants for the streaming output guard.
 *
 * Streaming output is held behind a compact rolling boundary. Twenty-four characters cover the
 * bounded secret/PII suffixes detected by the output scanner (SSNs, card numbers, phone numbers,
 * and the terminal portion of an email) without forcing a fast model to generate ~80 tokens
 * before TTFT. Every release still runs the cumulative guard, and completion runs a final
 * full-output guard, so reducing the boundary does not skip security checks.
 *
 * These live in their own module because both `/v1/chat/completions` and `/v1/responses` release
 * text against them. `/v1/responses` previously buffered the entire answer into a single
 * `output_text.delta`, which made time-to-first-token equal to full generation time; it now uses
 * the same boundary, and a shared home is what stops the two endpoints drifting apart again.
 */
export const STREAM_GUARD_HOLDBACK_CHARS = 24;
export const STREAM_GUARD_EMIT_BATCH_CHARS = 8;

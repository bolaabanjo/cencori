// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleProvider } from '../openai-compatible'
import type { StreamChunk } from '../base'

/** A provider stream shaped the way DeepSeek and GLM send a reasoning turn. */
function chunksFrom(deltas: Array<{ content?: string; reasoning_content?: string }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) yield { choices: [{ delta, finish_reason: null }] }
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
    },
  }
}

function providerWith(stream: unknown) {
  const provider = new OpenAICompatibleProvider('bai', 'key', 'https://example.invalid') as unknown as {
    client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } }
    stream: (request: unknown) => AsyncGenerator<StreamChunk>
  }
  provider.client = { chat: { completions: { create: vi.fn().mockResolvedValue(stream) } } }
  return provider
}

async function collect(provider: { stream: (r: unknown) => AsyncGenerator<StreamChunk> }) {
  const out: StreamChunk[] = []
  for await (const chunk of provider.stream({ model: 'glm-5.3-flash', messages: [] })) out.push(chunk)
  return out
}

describe('reasoning deltas', () => {
  /**
   * The failure this exists for. A reasoning model streams `reasoning_content` for tens of
   * seconds before its first `content` token. The adapter read only `content`, so every one of
   * those chunks became an empty delta and the client saw nothing at all until the model stopped
   * thinking — time-to-first-token equal to full generation time, on a stream that was arriving
   * the whole while.
   */
  it('surfaces thinking that arrives before any answer', async () => {
    const chunks = await collect(
      providerWith(
        chunksFrom([
          { reasoning_content: 'Let me work' },
          { reasoning_content: ' through this.' },
          { content: 'The answer is 391.' },
        ])
      )
    )

    expect(chunks.map((c) => c.reasoningDelta ?? '').join('')).toBe('Let me work through this.')
    // Thinking must not be concatenated into the reply.
    expect(chunks.map((c) => c.delta).join('')).toBe('The answer is 391.')
  })

  it('emits something for a turn that is still only thinking', async () => {
    const chunks = await collect(providerWith(chunksFrom([{ reasoning_content: 'Still working' }])))

    expect(chunks.some((c) => c.reasoningDelta)).toBe(true)
  })

  it('leaves a model that streams no reasoning exactly as it was', async () => {
    const chunks = await collect(providerWith(chunksFrom([{ content: 'Hi' }, { content: ' there' }])))

    expect(chunks.map((c) => c.delta).join('')).toBe('Hi there')
    expect(chunks.every((c) => c.reasoningDelta === undefined)).toBe(true)
  })
})

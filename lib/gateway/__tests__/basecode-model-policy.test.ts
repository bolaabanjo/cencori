import { afterEach, describe, expect, it } from 'vitest';
import { resolveBasecodePlanModel } from '@/lib/gateway/providers-setup';

describe('Basecode plan model policy', () => {
  afterEach(() => {
    delete process.env.BASECODE_AUTO_MODEL;
    delete process.env.BASECODE_BUILDER_AUTO_MODEL;
  });

  it('routes Free requests through the server-controlled Auto model', () => {
    process.env.BASECODE_AUTO_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';
    expect(resolveBasecodePlanModel('gpt-5.6-sol', 'auto')).toBe(
      'nvidia/nemotron-3-nano-30b-a3b:free',
    );
  });

  it('allows open-weight Builder models and rejects frontier models', () => {
    expect(resolveBasecodePlanModel('deepseek-v4-flash', 'open_weight')).toBe(
      'deepseek-v4-flash',
    );
    expect(() => resolveBasecodePlanModel('gpt-5.6-sol', 'open_weight')).toThrow();
  });

  it('does not narrow Pro frontier access', () => {
    expect(resolveBasecodePlanModel('claude-opus-5', 'frontier')).toBe('claude-opus-5');
  });
});

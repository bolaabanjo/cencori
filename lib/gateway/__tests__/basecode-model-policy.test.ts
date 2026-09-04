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

  it('defaults Free Auto requests to GLM 5.3 Flash', () => {
    expect(resolveBasecodePlanModel('auto', 'auto')).toBe('glm-5.3-flash');
  });

  /**
   * Auto is the default on the Free plan, not the only option. Every request used to be replaced by
   * the auto model whatever it named, so a picker offering a choice would have been lying — the
   * pick was discarded and every turn ran on the same model.
   */
  it('serves a Free user the open-weight model they asked for', () => {
    for (const model of ['maximo-atlas-1.2', 'glm-5.3-flash', 'deepseek-v4-flash']) {
      expect(resolveBasecodePlanModel(model, 'auto')).toBe(model);
    }
  });

  /** A frontier model is not on this plan, and is answered rather than refused, as it always was. */
  it('still substitutes rather than refusing a frontier model on Free', () => {
    expect(resolveBasecodePlanModel('claude-opus-5', 'auto')).toBe('glm-5.3-flash');
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

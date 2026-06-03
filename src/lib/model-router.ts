import Anthropic from '@anthropic-ai/sdk';

// Per-pass model config — provider + model name.
// Only 'anthropic' is wired today; the provider field is the A3 seam.
export interface PassConfig {
  provider: 'anthropic';
  model: string;
}

export interface ModelConfig {
  pass1:      PassConfig;
  pass2:      PassConfig;
  pass3:      PassConfig;
  extraction: PassConfig;
  vector:     PassConfig;
}

const DEFAULTS: ModelConfig = {
  pass1:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  pass2:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  pass3:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  extraction: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  vector:     { provider: 'anthropic', model: 'claude-haiku-4-5' },
};

// Read per-pass model overrides from runtime env vars.
// e.g. PASS1_MODEL=claude-opus-4-8 reroutes Pass 1 without touching code.
export function resolveModelConfig(env: Record<string, string | undefined>): ModelConfig {
  const resolve = (pass: keyof ModelConfig): PassConfig => ({
    provider: (env[`${pass.toUpperCase()}_PROVIDER`] as PassConfig['provider']) || DEFAULTS[pass].provider,
    model:    env[`${pass.toUpperCase()}_MODEL`]                                 || DEFAULTS[pass].model,
  });
  return {
    pass1:      resolve('pass1'),
    pass2:      resolve('pass2'),
    pass3:      resolve('pass3'),
    extraction: resolve('extraction'),
    vector:     resolve('vector'),
  };
}

// Model router — seam for future provider integrations (A3).
// All model calls flow through here; add provider branching when wiring additional providers.

export function streamModel(
  cfg: PassConfig,
  params: Omit<Parameters<Anthropic['messages']['stream']>[0], 'model'>,
  anthropic: Anthropic,
) {
  return anthropic.messages.stream({ ...params, model: cfg.model });
}

export async function callModel(
  cfg: PassConfig,
  params: Omit<Parameters<Anthropic['messages']['create']>[0], 'model'>,
  anthropic: Anthropic,
): Promise<Anthropic.Message> {
  return anthropic.messages.create({ ...params, model: cfg.model });
}

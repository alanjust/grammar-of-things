import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { EnhancedGenerateContentResponse, GenerateContentStreamResult } from '@google/generative-ai';
import OpenAI from 'openai';

// ─── Pass config ───────────────────────────────────────────────────────────────

export interface PassConfig {
  provider: 'anthropic' | 'gemini' | 'openai';
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
  pass1:      { provider: 'anthropic', model: 'claude-sonnet-5' },
  pass2:      { provider: 'anthropic', model: 'claude-sonnet-5' },
  pass3:      { provider: 'anthropic', model: 'claude-sonnet-5' },
  extraction: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  vector:     { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
};

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

// ─── Legacy Anthropic-only interface (all existing callers use these) ──────────
// These signatures are frozen — do not change them.

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

// ─── Neutral multi-provider interface (used by multi-provider stability) ────────

export interface NeutralRequest {
  system: string;
  prompt: string;
  maxTokens: number;
  image?: { mediaType: string; data: string };
}

export interface NeutralResponse {
  text: string;
  stopReason?: string;
}

// Stability pass configs — one per provider, overridable via env vars.
export interface StabilityConfigs {
  anthropic: PassConfig;
  gemini:    PassConfig;
  openai:    PassConfig;
}

export function resolveStabilityConfigs(env: Record<string, string | undefined>): StabilityConfigs {
  return {
    anthropic: { provider: 'anthropic', model: env['PASS1_MODEL']         || DEFAULTS.pass1.model },
    gemini:    { provider: 'gemini',    model: env['GEMINI_PASS1_MODEL']   || 'gemini-3.1-pro-preview' },
    openai:    { provider: 'openai',    model: env['OPENAI_PASS1_MODEL']   || 'gpt-5.4' },
  };
}

// ─── Provider adapters ─────────────────────────────────────────────────────────

async function callAnthropic(cfg: PassConfig, req: NeutralRequest, env: Record<string, string | undefined>): Promise<NeutralResponse> {
  const apiKey = env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey });

  type AnthropicMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const content: Anthropic.ContentBlockParam[] = [];
  if (req.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: req.image.mediaType as AnthropicMediaType, data: req.image.data },
    });
  }
  content.push({ type: 'text', text: req.prompt });

  const msg = await client.messages.create({
    model: cfg.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user', content }],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n\n');
  return { text, stopReason: msg.stop_reason ?? undefined };
}

async function callGemini(cfg: PassConfig, req: NeutralRequest, env: Record<string, string | undefined>): Promise<NeutralResponse> {
  const apiKey = env['GEMINI_API_KEY'];
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const client = new GoogleGenerativeAI(apiKey);

  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
  const parts: GeminiPart[] = [];
  if (req.image) {
    parts.push({ inlineData: { mimeType: req.image.mediaType, data: req.image.data } });
  }
  parts.push({ text: req.prompt });

  const model = client.getGenerativeModel({
    model: cfg.model,
    systemInstruction: req.system,
    generationConfig: { maxOutputTokens: req.maxTokens + 4096 },
  });
  const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const response = result.response;
  return {
    text: response.text(),
    stopReason: response.candidates?.[0]?.finishReason?.toString(),
  };
}

async function callOpenAI(cfg: PassConfig, req: NeutralRequest, env: Record<string, string | undefined>): Promise<NeutralResponse> {
  const apiKey = env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const client = new OpenAI({ apiKey });

  type OpenAIUserPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
  const content: OpenAIUserPart[] = [];
  if (req.image) {
    content.push({ type: 'image_url', image_url: { url: `data:${req.image.mediaType};base64,${req.image.data}` } });
  }
  content.push({ type: 'text', text: req.prompt });

  const completion = await client.chat.completions.create({
    model: cfg.model,
    max_completion_tokens: req.maxTokens,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user',   content },
    ],
  });
  return {
    text: completion.choices[0]?.message?.content ?? '',
    stopReason: completion.choices[0]?.finish_reason ?? undefined,
  };
}

export async function callModelNeutral(
  cfg: PassConfig,
  req: NeutralRequest,
  env: Record<string, string | undefined>,
): Promise<NeutralResponse> {
  if (cfg.provider === 'gemini')  return callGemini(cfg, req, env);
  if (cfg.provider === 'openai')  return callOpenAI(cfg, req, env);
  return callAnthropic(cfg, req, env);
}

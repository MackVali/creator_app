export const DEFAULT_AI_INTENT_MODEL = "gpt-4.1-nano";
export const AI_INTENT_MAX_PROMPT_CHARS = 2_000;
export const AI_INTENT_MAX_THREAD_MESSAGES = 6;
export const AI_INTENT_MAX_THREAD_MESSAGE_CHARS = 1_000;
export const AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS = 12_000;
export const AI_INTENT_MAX_OUTPUT_TOKENS = 600;
export const AI_INTENT_TEMPERATURE = 0.1;
export const AI_INTENT_STATIC_INPUT_CHARS_ESTIMATE = 12_000;

const ALLOWED_AI_INTENT_MODELS = new Set([DEFAULT_AI_INTENT_MODEL]);

type AiModelPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const MODEL_PRICING: Record<string, AiModelPricing> = {
  [DEFAULT_AI_INTENT_MODEL]: {
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
  },
  "gpt-4.1-mini": {
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
  },
};

export const AI_INTENT_MODEL =
  (() => {
    const configured = process.env.AI_MODEL?.trim();
    if (!configured) {
      return DEFAULT_AI_INTENT_MODEL;
    }
    if (ALLOWED_AI_INTENT_MODELS.has(configured)) {
      return configured;
    }
    console.warn(
      `AI_MODEL "${configured}" is not allowed for Phase 1; using ${DEFAULT_AI_INTENT_MODEL}`
    );
    return DEFAULT_AI_INTENT_MODEL;
  })();

export const getAiModelPricing = (model: string): AiModelPricing => {
  return (
    MODEL_PRICING[model] ??
    MODEL_PRICING[DEFAULT_AI_INTENT_MODEL] ?? {
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    }
  );
};

export const estimateAiIntentCostUsd = (args: {
  model: string;
  inputChars: number;
  maxOutputTokens?: number;
}): number => {
  const pricing = getAiModelPricing(args.model);
  const estimatedInputTokens = Math.ceil(
    Math.max(args.inputChars, 0) / 4
  );
  const outputTokens = args.maxOutputTokens ?? AI_INTENT_MAX_OUTPUT_TOKENS;
  return (
    (estimatedInputTokens * pricing.inputUsdPerMillion +
      outputTokens * pricing.outputUsdPerMillion) /
    1_000_000
  );
};

export const DEFAULT_AI_INTENT_MODEL = "gpt-4.1-nano";

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
  process.env.AI_MODEL?.trim() || DEFAULT_AI_INTENT_MODEL;

export const getAiModelPricing = (model: string): AiModelPricing => {
  return (
    MODEL_PRICING[model] ??
    MODEL_PRICING[DEFAULT_AI_INTENT_MODEL] ?? {
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    }
  );
};

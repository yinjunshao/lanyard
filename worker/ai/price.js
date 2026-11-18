// Model prices, in one place. All figures are USD per million tokens, which is also micro-dollars per
// token, so cost in micro-dollars = input_tokens * input_price + output_tokens * output_price.
//
// THE DEFAULTS BELOW ARE THE FIGURES IN "AI Safety and Cost Plan" (written 2026-11-10) AND HAVE NOT
// BEEN CHECKED against OpenRouter's published pricing for the model by whoever built this. Until the owner has checked
// them and set AI_PRICE_INPUT_PER_MTOK_USD and AI_PRICE_OUTPUT_PER_MTOK_USD, the admin page says the
// prices are unconfirmed. A model change (AI_MODEL) needs new prices too.
const DEFAULT_IN = 0.10;
const DEFAULT_OUT = 0.40;

const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function prices(env) {
  const i = num(env.AI_PRICE_INPUT_PER_MTOK_USD);
  const o = num(env.AI_PRICE_OUTPUT_PER_MTOK_USD);
  return { input: i ?? DEFAULT_IN, output: o ?? DEFAULT_OUT, confirmed: i !== null && o !== null };
}

/** Whole micro-dollars, rounded up, so a cheap call is never counted as free. */
export function costMicros(env, inputTokens, outputTokens) {
  const p = prices(env);
  return Math.ceil(Math.max(0, inputTokens) * p.input + Math.max(0, outputTokens) * p.output);
}

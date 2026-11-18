// Local-only stand-in for the model (AI_STUB=1, refused on any non-local origin: see config.js). It
// answers in the OpenAI-style chat shape OpenRouter uses without any network call, so Settings and the admin page
// can be tried without a key. A feature may pass its own `stub` (an object or text) to callModel.
export function stubResponse({ system, user, stub }) {
  const text = stub === undefined ? '{"ok":true}' : typeof stub === "string" ? stub : JSON.stringify(stub);
  return {
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: Math.ceil((system.length + user.length) / 4), completion_tokens: Math.ceil(text.length / 4) },
  };
}

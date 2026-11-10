// The admin page's "test the connection" call: the smallest possible request, with no personal data. It
// shows the pattern every feature follows: a version string (part of the cache key), the task as the system
// prompt, the schema the reply must fit, and a canned reply for local stub mode.
import { S } from "../validate.js";

export const ADMIN_TEST = {
  feature: "admin_test",
  promptVersion: "admin-test-1",
  system: 'Reply with exactly this JSON and nothing else: {"ok": true}',
  data: { ping: "hello" },
  schema: S.obj({ ok: S.bool() }),
  maxTokens: 20,
  stub: { ok: true },
};

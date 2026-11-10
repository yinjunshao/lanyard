// F17: who to meet. Matching comes in F17.3; until then everyone is "someone new".
import { presenceCandidates } from "./presence.js";

export const NEW_REASON = "Say hi to someone new";
export const NEW_COUNT = 3;

const shuffled = (items) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export async function suggest(db, { eventId, viewerId, clock = Date.now() }) {
  const rows = await presenceCandidates(db, eventId, viewerId, clock);
  return { mode: "new", people: shuffled(rows).slice(0, NEW_COUNT).map((r) => ({ ...r, reason: NEW_REASON })) };
}

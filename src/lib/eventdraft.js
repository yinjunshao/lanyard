// F30: the half-made "Create event" form, kept in this browser tab's session storage so a
// refresh does not lose it. Host pages only; no imports, so hostapi.js can clear it on sign-out
// without pulling anything in. Nothing here touches the server: the event is saved by Create.
//
// Every read and write is inside try/catch: session storage can be off, full or blocked
// (private windows, strict settings), and the form must work without it.
//
// The key names the signed-in host and the organisation, so two accounts on one browser tab
// never see each other's draft. It is cleared on Create, on Cancel and on every host sign-out;
// a draft that belongs to someone else is removed when this one is read.
const PREFIX = "lanyard:host:event-draft:";
const keyFor = (email, orgId) => `${PREFIX}${String(email || "").toLowerCase()}:${orgId || ""}`;

const store = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };

function removeWhere(keep) {
  const s = store();
  if (!s) return;
  try {
    const stale = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX) && k !== keep) stale.push(k);
    }
    stale.forEach((k) => s.removeItem(k));
  } catch { /* nothing to do */ }
}

// The saved form, or null. Anyone else's draft is removed.
export function loadDraft(email, orgId) {
  const key = keyFor(email, orgId);
  removeWhere(key);
  try {
    const raw = store()?.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 && d.form && typeof d.form === "object" ? d.form : null;
  } catch { return null; }
}

export function saveDraft(email, orgId, form) {
  try { store()?.setItem(keyFor(email, orgId), JSON.stringify({ v: 1, form })); } catch { /* storage is off or full */ }
}

export function clearDraft(email, orgId) {
  try { store()?.removeItem(keyFor(email, orgId)); } catch { /* nothing to do */ }
}

// Sign-out: every draft in this tab, whoever's it was.
export function clearAllDrafts() { removeWhere(null); }

<script setup>
// Passkeys on this account (F43): the list, Rename, Remove (asked once, in a small sheet) and "Add a passkey on
// this device". Removing only takes the passkey off the Lanyard account; the copy on the device or in a password
// manager stays, and the sheet says how to delete that too. Signed-in Settings only: it is loaded with the page,
// never by a public page (the first-load budget, F28), so it calls api() and not lib/passkeys.js.
// UiSheet must stay the last child of the root element (it moves itself to <body>).
import { nextTick, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { explain } from "../lib/errors";
import { refreshMe } from "../lib/store";
import { registerPasskey, passkeysSupported } from "../lib/passkeys";
import { useBusy } from "./Waiting.vue";
import UiSheet from "./ui/UiSheet.vue";

const passkeys = ref([]);
const error = ref("");
const note = ref("");
const renamingId = ref(null);
const draft = ref("");
const removing = ref(null);
const removeError = ref("");
const field = ref(null);
const addBtn = ref(null);
const { working, once } = useBusy();

const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const day = (t) => fmt.format(new Date(t));
const nameOf = (p) => p.name || `Passkey added ${day(p.addedAt)}`;

async function load() {
  try { passkeys.value = (await api("/api/passkeys")).passkeys; }
  catch (e) { if (e?.status !== 401) error.value = explain(e, "We couldn't load your passkeys. Reload the page and try again."); }
}

function startRename(p) {
  error.value = ""; note.value = "";
  renamingId.value = p.id;
  draft.value = nameOf(p);
  nextTick(() => field.value?.[0]?.focus?.({ preventScroll: true }) || field.value?.focus?.({ preventScroll: true }));
}
const saveRename = once(async () => {
  error.value = "";
  const name = draft.value.trim();
  if (!name) { error.value = "Give it a name of 1 to 40 characters."; return; }
  try {
    await api(`/api/passkeys/${encodeURIComponent(renamingId.value)}`, "PATCH", { name });
    renamingId.value = null;
    note.value = "Name saved.";
    await load();
  } catch (e) { error.value = explain(e, "We couldn't save that name. Try again."); }
});

function askRemove(p) { error.value = ""; note.value = ""; removeError.value = ""; removing.value = p; }
const remove = once(async () => {
  removeError.value = "";
  try {
    await api(`/api/passkeys/${encodeURIComponent(removing.value.id)}`, "DELETE");
    removing.value = null;
    note.value = "Passkey removed from your Lanyard account. You stay signed in.";
    await load();
    await refreshMe(); // "Passkey saved" above must match
  } catch (e) { removeError.value = explain(e, "We couldn't remove that passkey. Try again."); }
});

const add = once(async () => {
  error.value = ""; note.value = "";
  try {
    await registerPasskey();
    note.value = "Passkey saved.";
    await load();
    await refreshMe();
  } catch (e) {
    error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled."
      : e?.name === "InvalidStateError" ? "This device already has a passkey for Lanyard. Use another device, or remove it first."
      : explain(e, "Passkey setup failed. Try again, or use another way to sign in.");
  }
});

onMounted(load);
</script>

<template>
  <div class="stack">
    <template v-if="passkeys.length">
      <span class="label">Passkeys</span>
      <div class="list" role="list">
        <div v-for="p in passkeys" :key="p.id" class="pk-row" role="listitem">
          <form v-if="renamingId === p.id" class="pk-form" @submit.prevent="saveRename">
            <input ref="field" v-model="draft" :aria-label="`Name for ${nameOf(p)}`" maxlength="40" autocomplete="off" />
            <span class="row-actions">
              <button class="btn btn-primary" style="width:auto" :disabled="!!working">{{ working === saveRename ? "Saving…" : "Save" }}</button>
              <button type="button" class="btn" style="width:auto" :disabled="!!working" @click="renamingId = null">Cancel</button>
            </span>
          </form>
          <template v-else>
            <span>
              <strong>{{ nameOf(p) }}</strong><br />
              <template v-if="p.name"><span class="small muted">Added {{ day(p.addedAt) }}</span><br /></template>
              <span class="small muted">{{ p.lastUsedAt ? `Last used ${day(p.lastUsedAt)}` : "Not used yet" }}</span>
            </span>
            <span class="row-actions">
              <button type="button" class="btn" style="width:auto" :aria-label="`Rename ${nameOf(p)}`" :disabled="!!working" @click="startRename(p)">Rename</button>
              <button type="button" class="btn" style="width:auto" :aria-label="`Remove ${nameOf(p)}`" :disabled="!!working" @click="askRemove(p)">Remove</button>
            </span>
          </template>
        </div>
      </div>
    </template>

    <template v-if="passkeysSupported()">
      <p class="small muted">
        A passkey saved to your phone or a password manager may already work on your other devices. Add one here
        if you want this device to have its own.
      </p>
      <button ref="addBtn" type="button" class="btn" :disabled="!!working" @click="add">{{ working === add ? "Waiting for your device…" : "Add a passkey on this device" }}</button>
    </template>
    <p v-if="note" class="success-text small" role="status">{{ note }}</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <UiSheet :open="!!removing" :anchor="addBtn" label="Remove this passkey" modal @close="removing = null">
      <div class="stack">
        <p style="margin:0">Remove this passkey from your Lanyard account? You can also delete it from your device's password settings.</p>
        <p v-if="removing" class="small muted" style="margin:0"><strong>{{ nameOf(removing) }}</strong>. You stay signed in on every device.</p>
        <button type="button" class="btn btn-primary" :disabled="!!working" @click="remove">{{ working === remove ? "Removing…" : "Remove passkey" }}</button>
        <button type="button" class="btn" :disabled="!!working" @click="removing = null">Keep it</button>
        <p v-if="removeError" class="error-text" role="alert">{{ removeError }}</p>
      </div>
    </UiSheet>
  </div>
</template>

<style>
.pk-row { display: flex; flex-direction: column; gap: 10px; padding: 13px 16px; border-bottom: var(--border); }
.pk-row:last-child { border-bottom: none; }
.pk-row strong { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
.pk-form { display: flex; flex-direction: column; gap: 10px; }
.row-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>

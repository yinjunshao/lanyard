<script setup>
// "Signed-in devices (3)": a button that opens a sheet. Each row is one device (browser
// and system, when it first signed in, "This device" on the one you are using); a tap
// shows its details and "Sign out this device". The footer signs out all the others.
// UiSheet must stay the last child of the root element (it moves itself to <body>).
import { computed, nextTick, onMounted, ref } from "vue";
import { Api } from "../lib/api";
import Icon from "./Icon.vue";
import UiSheet from "./ui/UiSheet.vue";

const sessions = ref([]);
const loaded = ref(false);
const open = ref(false);
const selectedId = ref(null);
const busy = ref(false);
const note = ref("");
const error = ref("");
const trigger = ref(null);
const body = ref(null);

const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const when = (t) => fmt.format(new Date(t));
const selected = computed(() => sessions.value.find((s) => s.id === selectedId.value) || null);
const others = computed(() => sessions.value.filter((s) => !s.current).length);

async function load() {
  try { sessions.value = (await Api.sessions()).sessions; } catch { /* guest or offline */ }
  loaded.value = true;
}
function focusFirst() {
  nextTick(() => body.value?.querySelector("button")?.focus({ preventScroll: true }));
}
function show(id) { selectedId.value = id; error.value = ""; focusFirst(); }
function openSheet() { selectedId.value = null; error.value = ""; open.value = true; }
function close() { open.value = false; selectedId.value = null; }

async function signOutOne(s) {
  error.value = ""; note.value = ""; busy.value = true;
  try {
    await Api.signOutDevice(s.id);
    note.value = `Signed out ${s.device}.`;
    selectedId.value = null;
    await load();
    focusFirst();
  } catch (e) { error.value = e.message; await load(); selectedId.value = null; }
  finally { busy.value = false; }
}
async function signOutOthers() {
  if (!window.confirm("Sign out every other device? This one stays signed in.")) return;
  error.value = ""; note.value = ""; busy.value = true;
  try {
    const r = await Api.signOutOthers();
    note.value = r.signedOut ? `Signed out ${r.signedOut} other ${r.signedOut === 1 ? "device" : "devices"}.` : "No other devices were signed in.";
    await load();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <div v-if="loaded && sessions.length" class="stack">
    <button ref="trigger" type="button" class="btn" aria-haspopup="dialog" @click="openSheet">Signed-in devices ({{ sessions.length }})</button>
    <p v-if="note" class="success-text small" role="status">{{ note }}</p>
    <UiSheet :open="open" :anchor="trigger" label="Signed-in devices" fit @close="close">
      <div ref="body" class="stack devices-sheet">
        <template v-if="!selected">
          <div class="list">
            <button v-for="s in sessions" :key="s.id" type="button" class="list-row spread" @click="show(s.id)">
              <span>
                <strong>{{ s.device }}</strong><br />
                <span class="small muted">First signed in {{ when(s.at) }}<template v-if="s.current"> · <strong>This device</strong></template></span>
              </span>
              <span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
            </button>
          </div>
          <button v-if="others" type="button" class="btn" :disabled="busy" @click="signOutOthers">Sign out all other devices</button>
          <p v-if="note" class="success-text small" role="status">{{ note }}</p>
        </template>
        <template v-else>
          <button type="button" class="settings-back link-btn" @click="show(null)">‹ All devices</button>
          <h3 style="margin:0">{{ selected.device }}</h3>
          <dl class="small devices-details">
            <dt class="label">First signed in</dt><dd>{{ when(selected.at) }}</dd>
            <dt class="label">Stays signed in until</dt><dd>{{ when(selected.until) }}</dd>
          </dl>
          <p v-if="selected.current" class="small muted"><strong>This device.</strong> To leave it, use Log out on the Settings list.</p>
          <button v-else type="button" class="btn" :disabled="busy" @click="signOutOne(selected)">Sign out this device</button>
        </template>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      </div>
    </UiSheet>
  </div>
</template>

<style>
.devices-details { margin: 0; display: grid; gap: 2px; }
.devices-details dd { margin: 0 0 8px; }
</style>

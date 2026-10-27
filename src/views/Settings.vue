<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";
import { registerPasskey, passkeysSupported } from "../lib/passkeys";
import { drawQR } from "../lib/qr";
import Icon from "../components/Icon.vue";
import { getThemePref, setThemePref } from "../lib/theme";

const router = useRouter();
const error = ref("");
const host = location.host;
const themePref = ref(getThemePref());
const THEME_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
function pickTheme(v) { themePref.value = v; setThemePref(v); }

onMounted(refreshMe);

const gbp = (pence) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;
const joining = ref(false);
async function joinWaitlist() {
  joining.value = true;
  try {
    await Api.plusWaitlist();
    await refreshMe();
  } catch (e) {
    error.value = e.message;
  } finally {
    joining.value = false;
  }
}

async function addPasskey() {
  error.value = "";
  try {
    await registerPasskey();
    await refreshMe();
  } catch (e) {
    error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled." : e?.message || "Passkey setup failed.";
  }
}

// Sign in on another device: a short-lived one-time code, also as a QR.
const link = ref(null); // { code, expiresAt, url }
const linkCanvas = ref(null);
const secondsLeft = ref(0);
const linkBusy = ref(false);
let tick = null;
async function showLink() {
  error.value = ""; linkBusy.value = true;
  try {
    const r = await Api.authLink();
    link.value = { ...r, url: `${location.origin}/signin?code=${r.code}` };
    clearInterval(tick);
    const update = () => {
      secondsLeft.value = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
      if (!secondsLeft.value) { clearInterval(tick); link.value = null; }
    };
    update();
    tick = setInterval(update, 1000);
    await nextTick();
    if (linkCanvas.value) await drawQR(linkCanvas.value, link.value.url, 360);
  } catch (e) { error.value = e.message; }
  finally { linkBusy.value = false; }
}
onBeforeUnmount(() => clearInterval(tick));
const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

async function logout() {
  if (!me.user?.claimed && !confirm("Your card isn't saved yet. If you log out, you can't get back into it. Log out anyway?")) return;
  await Api.logout();
  await refreshMe();
  router.push("/");
}

async function erase() {
  if (!confirm("Delete your account and all connections, selfies and notes? This cannot be undone.")) return;
  await Api.deleteAccount();
  router.push("/");
}
</script>

<template>
  <div class="stack-2">
    <h1>Settings</h1>

    <section id="signin" class="panel stack">
      <div class="spread">
        <span>
          <span class="label">Sign-in</span><br />
          <strong>{{ me.user?.hasPasskey ? "Passkey saved" : me.user?.hasRecovery ? "Recovery key saved" : "Not saved yet" }}</strong>
        </span>
        <router-link v-if="!me.user?.hasPasskey || !me.user?.hasRecovery" to="/claim" class="btn btn-primary" style="width:auto">
          {{ me.user?.claimed ? "Add more" : "Save my card" }}
        </router-link>
      </div>
      <p v-if="!me.user?.claimed" class="small muted">
        Your card only lives in this browser until you save it. It takes one tap.
      </p>
      <p v-if="me.user?.recoveryEmail" class="small muted">Recovery email: {{ me.user.recoveryEmail }}</p>
      <button v-if="!me.user?.hasPasskey && passkeysSupported()" class="btn" @click="addPasskey">Add a passkey</button>

      <template v-if="!link">
        <button class="btn" :disabled="linkBusy" @click="showLink">Sign in on another device</button>
      </template>
      <div v-else class="stack" style="align-items:center;text-align:center">
        <p class="small muted">On the other device open <strong>{{ host }}/signin</strong> and enter this code, or scan the QR.</p>
        <p class="tnum" style="font-size:36px;font-weight:800;letter-spacing:4px;margin:0">{{ link.code }}</p>
        <canvas ref="linkCanvas" width="360" height="360" style="width:180px;height:180px" aria-label="Sign-in QR code"></canvas>
        <p class="small muted">One use, expires in {{ mmss(secondsLeft) }}.</p>
      </div>
    </section>

    <div class="list">
      <div class="list-row spread">
        <span><span class="label">Appearance</span><br />Light or dark</span>
        <div class="seg" role="group" aria-label="Appearance">
          <button v-for="o in THEME_OPTIONS" :key="o.value" type="button" class="seg-btn"
                  :class="{ on: themePref === o.value }" :aria-pressed="themePref === o.value"
                  @click="pickTheme(o.value)">{{ o.label }}</button>
        </div>
      </div>
    </div>

    <section id="plus" class="panel stack-2">
      <div class="spread">
        <span class="label">Your plan</span>
        <strong>{{ me.plan.label }}</strong>
      </div>
      <template v-if="me.plan.tier === 'free'">
        <h2>Lanyard Plus</h2>
        <p class="small muted">
          One paid plan, priced for students:
          <strong>{{ gbp(me.plan.plusPrice?.yearlyPence || 2400) }} a year</strong>
          or {{ gbp(me.plan.plusPrice?.monthlyPence || 299) }} a month.
          Everything you use today stays free.
        </p>
        <ul class="small plan-list">
          <li><strong>Up to 12 cards</strong>, one for each room you walk into (Free: {{ me.plan.freeCards || 3 }}).</li>
          <li><strong>Custom strap colours</strong> on every card.</li>
          <li><strong>Coming first:</strong> card views and connection stats, CSV and vCard export of your people, your own link name, follow-up reminders.</li>
        </ul>
        <button v-if="!me.plan.onWaitlist" class="btn btn-primary" :disabled="joining" @click="joinWaitlist">
          Tell me when Plus opens
        </button>
        <p v-else class="success-text small">You're on the list. We'll email if you've added a recovery email, otherwise you'll see it here first.</p>
      </template>
      <p v-else class="small muted">Thanks for backing Lanyard. You have {{ me.plan.cards }} cards and custom colours.</p>
    </section>

    <div class="list">
      <router-link to="/host" class="list-row spread">
        <span>Run events? Open the host portal</span>
        <span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
      <a class="list-row spread" :href="Api.exportUrl" target="_blank" rel="noopener">
        <span>Download my data</span><span class="muted" style="display:inline-flex"><Icon name="download" :size="18" /></span>
      </a>
      <router-link to="/app/profile" class="list-row spread">
        <span>Edit profile</span><span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
      <button class="list-row spread" style="width:100%;text-align:left;background:none;border:none;cursor:pointer" @click="logout">
        <span>Log out of this device</span><span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </button>
    </div>

    <details class="list" style="padding:16px">
      <summary class="error-text" style="cursor:pointer;font-weight:700">Delete account</summary>
      <p class="small muted" style="margin:12px 0">
        Removes your profile, cards, private notes and connections. Shared
        selfies are deleted for everyone. This is permanent.
      </p>
      <button class="btn" style="color:var(--strap-deep)" @click="erase">Delete everything</button>
    </details>

    <p v-if="error" class="error-text">{{ error }}</p>

    <p class="small muted">
      <router-link to="/terms">Terms</router-link> · <router-link to="/privacy">Privacy policy</router-link>.
      Shared selfies are deleted after 12 months. Hosts only ever see aggregate numbers.
    </p>
  </div>
</template>

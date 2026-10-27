<script setup>
import { onMounted, ref } from "vue";
import { me } from "../lib/store";
import { defaultCard } from "../lib/store";
import Badge from "../components/Badge.vue";

// Static demo badge for the hero — scans open the same landing page until real
// cards exist.
const demo = {
  cardId: "demo",
  code: "LNYD",
  name: "Careers fair",
  note: "Ask me about spring internships",
  theme: "default",
  strapColor: null,
  profile: {
    userId: "demo",
    name: "Maya Okafor",
    photo: null,
    uni: "UCL",
    course: "Mechanical Engineering",
    year: "Year 2",
    headline: "Design engineer, formula student",
    about: "",
    links: { LinkedIn: "https://linkedin.com", Portfolio: "https://example.com" },
    tags: ["CV reviews", "CAD", "internships"],
    projects: [],
  },
};
const url = ref(`${location.origin}/`);
onMounted(() => { url.value = `${location.origin}/`; });
</script>

<template>
  <div class="landing">
    <div class="strap-rail"></div>
    <header class="landing-top">
      <span class="wordmark">lanyard<b>.</b></span>
      <span style="display:flex;gap:18px">
        <router-link to="/hosts" class="topbar-link">For hosts</router-link>
        <router-link v-if="!me.user?.claimed" to="/signin" class="topbar-link">Sign in</router-link>
      </span>
    </header>

    <div class="landing-hero">
      <div class="stack-3">
        <div>
          <span class="label">Networking for events</span>
          <h1 style="margin-top:10px">Remember everyone you meet.</h1>
          <p class="lede">
            A badge you show at events. People scan it and connect with a shared
            selfie — so a week later you remember the face, the name and what
            they can help with.
          </p>
        </div>

        <ol class="steps">
          <li class="step"><div><strong>Show.</strong>
            <span class="muted"> Your card and QR, full screen.</span></div></li>
          <li class="step"><div><strong>Scan.</strong>
            <span class="muted"> They open your card and tap Connect.</span></div></li>
          <li class="step"><div><strong>Remember.</strong>
            <span class="muted"> Face, name and “come to me for” — saved.</span></div></li>
        </ol>

        <div class="btn-row">
          <router-link v-if="!me.profile" to="/app/profile" class="btn btn-primary">Make your card</router-link>
          <router-link v-else to="/app" class="btn btn-primary">Open my card</router-link>
          <router-link to="/hosts" class="btn">I'm hosting an event</router-link>
        </div>
        <p class="small muted"><router-link to="/terms">Terms</router-link> · <router-link to="/privacy">Privacy</router-link></p>
        <p class="small muted">Free for attendees · no app to download<template v-if="!me.user?.claimed"> · <router-link to="/signin">Already have a card? Sign in</router-link></template></p>
      </div>

      <div class="badge-stage">
        <Badge :view="demo" :url="url" />
      </div>
    </div>
  </div>
</template>

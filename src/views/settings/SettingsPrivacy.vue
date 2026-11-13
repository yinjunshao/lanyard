<script setup>
// Privacy and data. F21 added the AI search switch, above the consent history.
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../../lib/api";
import ConsentHistory from "../../components/ConsentHistory.vue";
import AiSearchSetting from "./AiSearchSetting.vue";
import AttendanceSetting from "./AttendanceSetting.vue";
import Icon from "../../components/Icon.vue";

const router = useRouter();
const error = ref("");
async function erase() {
  if (!confirm("Delete your account and all connections, selfies and notes? This cannot be undone.")) return;
  error.value = "";
  try {
    await Api.deleteAccount();
    router.push("/");
  } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div class="stack-2">
    <div class="list">
      <a class="list-row spread" :href="Api.exportUrl" target="_blank" rel="noopener">
        <span>Download my data</span><span class="muted" style="display:inline-flex"><Icon name="download" :size="18" /></span>
      </a>
    </div>

    <AiSearchSetting />

    <AttendanceSetting />

    <ConsentHistory />

    <p class="small muted">Shared selfies are deleted after 12 months. Hosts see aggregate numbers, and a list of names only at an event that tells you so when you check in and only if you leave that tick on.</p>

    <details class="list" style="padding:16px">
      <summary class="error-text" style="cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center">Delete account</summary>
      <p class="small muted" style="margin:12px 0">
        Removes your profile, cards, private notes and connections. Shared
        selfies are deleted for everyone. This is permanent.
      </p>
      <button class="btn" style="color:var(--strap-deep)" @click="erase">Delete everything</button>
    </details>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>

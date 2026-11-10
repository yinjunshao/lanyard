<script setup>
// Step 1: name and photo. Terms and the 18+ confirmation sit here, once, for
// anyone who has not accepted them yet, so no pop-up lands on top later.
import { computed, ref } from "vue";
import { Api } from "../../lib/api";
import { me, refreshMe } from "../../lib/store";
import Avatar from "../Avatar.vue";
import PhotoCropper from "../PhotoCropper.vue";

defineProps({ from: { type: String, default: "" } }); // first name of who they just connected with

const name = ref(me.profile?.name || "");
const photo = ref(null); // a new photo, as a data URL, waiting to be saved
const shownPhoto = computed(() => photo.value || me.profile?.photo || null);
const cropFile = ref(null);
const needsTerms = computed(() => !me.user?.termsAccepted);
const agreed = ref(false);

function pick(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) cropFile.value = file;
}
function cropped(dataUrl) { cropFile.value = null; photo.value = dataUrl; }

const ready = computed(() => !!name.value.trim() && (!needsTerms.value || agreed.value));

async function save() {
  if (!name.value.trim()) throw new Error("Add your name so people know who you are.");
  if (needsTerms.value && !agreed.value) throw new Error("Please confirm you're 18 or over and agree to the Terms and Privacy Policy.");
  if (!me.profile) {
    await Api.createProfile({
      name: name.value, photoDataUrl: photo.value || undefined, over18: true, acceptTerms: true, note: "", onboarding: true,
    });
  } else {
    if (needsTerms.value) await Api.acceptTerms();
    await Api.updateProfile({ name: name.value, ...(photo.value ? { photoDataUrl: photo.value } : {}) });
  }
  photo.value = null;
  await refreshMe();
}
defineExpose({ ready, save });
</script>

<template>
  <div class="stack-2">
    <PhotoCropper v-if="cropFile" :file="cropFile" @done="cropped" @cancel="cropFile = null" />
    <h1>Your name and photo</h1>
    <p v-if="from" class="notice small">Finish your card so {{ from }} can find you again.</p>
    <p class="muted" style="margin:0">People remember faces. Add one so they remember yours.</p>

    <div class="field"><label for="name">Name</label>
      <input id="name" v-model="name" type="text" autocomplete="name" maxlength="80" /></div>

    <div id="photo" class="field">
      <span class="label-top">Photo (optional)</span>
      <div class="file-picker">
        <Avatar class="avatar" style="width:64px;height:64px" :src="shownPhoto" alt="Your photo" />
        <label for="photoCamera" class="btn">Take a photo</label>
        <input id="photoCamera" class="visually-hidden" type="file" accept="image/*" capture="user" @change="pick" />
        <label for="photoFile" class="btn">{{ shownPhoto ? "Change" : "Upload" }}</label>
        <input id="photoFile" class="visually-hidden" type="file" accept="image/*" @change="pick" />
      </div>
    </div>

    <label v-if="needsTerms" class="checkbox-row field">
      <input v-model="agreed" type="checkbox" />
      <span class="small">
        I'm 18 or over, and I agree to the
        <router-link to="/terms" target="_blank">Terms of Service</router-link> and
        <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
      </span>
    </label>
  </div>
</template>

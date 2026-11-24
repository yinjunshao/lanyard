<script setup>
// What a scan opens: a person's card as someone else sees it (F18). The real card page
// (PublicCard) and the live preview in the card editors both draw it, so they cannot drift.
// It shows only what the view carries: the card's own links and tags, its theme and strap.
// What belongs to the visitor (the connect button, the selfie you took together) stays in
// PublicCard and is passed in as this component's content, drawn at the foot of the card.
import { computed, useSlots } from "vue";
import Avatar from "./Avatar.vue";
import Icon from "./Icon.vue";
import { openPhoto } from "../lib/lightbox";
import { subtitleOf } from "../lib/profile";

const props = defineProps(["view"]);
// Drawn by calling the slot function, as UiSheet does: a compiled <slot> adds renderSlot to the Vue chunk every public page loads.
const slots = useSlots();
const Foot = () => slots.default?.();

const p = computed(() => props.view.profile || {});
const first = computed(() => (p.value.name || "").split(/\s+/)[0]);
const meta = computed(() => subtitleOf(p.value, { year: true }));
const links = computed(() => Object.entries(p.value.links || {}));
// Nothing to show beyond a name: say so, rather than a page that looks broken.
const isBare = computed(() => !props.view.limited && !p.value.headline && !p.value.about && !meta.value && !props.view.note
  && !(p.value.tags || []).length && !(p.value.projects || []).length && !links.value.length);
const common = computed(() => (Array.isArray(props.view.inCommon) ? props.view.inCommon : []));
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
</script>

<template>
  <article class="profile" :class="view.theme">
    <div class="profile-strap" :style="view.strapColor ? { '--card-strap': view.strapColor, '--card-strap-ink': view.strapInk || '#fff' } : null">
      <span class="profile-strap-word">lanyard</span>
      <span class="profile-strap-card">{{ view.name }}</span>
    </div>

    <div class="profile-body">
      <div class="profile-id">
        <Avatar class="profile-photo" :class="{ zoomable: p.photo }" :src="p.photo" :alt="p.name" @click="openPhoto(p.photo, p.name)" />
        <div class="profile-id-text">
          <h1>{{ p.name }}</h1>
          <p v-if="meta" class="muted">{{ meta }}</p>
        </div>
      </div>

      <p v-if="p.headline" class="profile-headline">{{ p.headline }}</p>
      <!-- F16: what you two have chosen to show each other has in common. One line; the third fact folds to +1 on a phone. -->
      <section v-if="common.length" class="in-common" aria-label="In common">
        <span class="label">In common</span>
        <p class="in-common-line">{{ common.slice(0, 2).map((f) => f.text).join(" · ") }}<span v-if="common[2]" class="ic-third"> · {{ common[2].text }}</span><span v-if="common[2]" class="ic-more" aria-hidden="true"> +1</span></p>
      </section>


      <blockquote v-if="view.note" class="profile-quote">“{{ view.note }}”</blockquote>

      <p v-if="isBare" class="profile-section small muted" role="status">
        {{ view.viewer?.isOwner ? "Your card only shows your name so far." : `${first} hasn't filled in their card yet, so there's only their name for now.` }}
        <router-link v-if="view.viewer?.isOwner" to="/app/profile" class="link-btn">Add what you can help with</router-link>
      </p>

      <section v-if="p.tags?.length" class="profile-section">
        <span class="label">Come to me for</span>
        <div class="chip-row">
          <span v-for="t in p.tags" :key="t" class="chip">{{ t }}</span>
        </div>
      </section>

      <section v-if="p.about" class="profile-section">
        <span class="label">About</span>
        <p class="profile-about">{{ p.about }}</p>
      </section>

      <section v-if="p.projects?.length" class="profile-section">
        <span class="label">Projects</span>
        <div class="stack">
          <component
            :is="pr.url ? 'a' : 'div'"
            v-for="(pr, i) in p.projects"
            :key="i"
            class="project"
            :href="pr.url || undefined" target="_blank" rel="noopener"
          >
            <img v-if="pr.image" :src="pr.image" :alt="pr.title ? `Image for ${pr.title}` : 'Project image'" class="project-img" />
            <span class="project-text">
              <strong>{{ pr.title }}</strong>
              <span v-if="pr.line" class="small muted">{{ pr.line }}</span>
            </span>
            <span v-if="pr.url" class="muted" style="display:inline-flex"><Icon name="external" :size="16" /></span>
          </component>
        </div>
      </section>

      <section v-if="links.length" class="profile-section">
        <span class="label">Find {{ first }} online</span>
        <div class="list">
          <a v-for="[label, url] in links" :key="label" class="list-row spread"
             :href="url" target="_blank" rel="noopener">
            <span class="link-label">
              <strong>{{ label }}</strong>
              <span class="small muted">{{ host(url) }}</span>
            </span>
            <span class="muted" style="display:inline-flex"><Icon name="external" :size="16" /></span>
          </a>
        </div>
      </section>

      <Foot />
    </div>
  </article>
</template>

<style scoped>
.in-common { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; margin: 12px 0 0; }
.in-common-line { margin: 0; color: var(--ink); flex: 1 1 12rem; min-width: 0; }
.ic-more { display: none; }
@media (max-width: 599px) {
  .ic-third { display: none; }
  .ic-more { display: inline; }
}
</style>

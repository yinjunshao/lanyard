<script setup>
// A person's photo, or — when they haven't added one — a neutral silhouette
// (head and shoulders) instead of an empty box. Size and shape come from the
// class the caller passes (.avatar, .badge-photo, .profile-photo …).
defineProps({ src: { type: String, default: null }, alt: { type: String, default: "" } });
</script>

<template>
  <img v-if="src" :src="src" :alt="alt" />
  <span v-else class="silhouette" role="img" :aria-label="alt || 'No photo'">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="24" r="11" fill="currentColor" />
      <path d="M9 64c0-14.4 10.3-23 23-23s23 8.6 23 23z" fill="currentColor" />
    </svg>
  </span>
</template>

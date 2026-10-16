<script setup>
// Decorative, non-scannable QR placeholder (finder squares + dots).
defineProps({ size: { type: [Number, String], default: 150 } });
</script>

<template>
  <div class="fakeqr" :style="{ width: typeof size === 'number' ? size + 'px' : size, height: typeof size === 'number' ? size + 'px' : size }" aria-hidden="true">
    <svg viewBox="0 0 100 100" role="img" aria-label="placeholder">
      <rect width="100" height="100" rx="12" fill="#fff" />
      <g fill="#0e1110">
        <rect x="9" y="9" width="27" height="27" rx="7" />
        <rect x="16" y="16" width="13" height="13" rx="3" fill="#fff" />
        <rect x="20" y="20" width="5" height="5" rx="1.4" />
        <rect x="64" y="9" width="27" height="27" rx="7" />
        <rect x="71" y="16" width="13" height="13" rx="3" fill="#fff" />
        <rect x="75" y="20" width="5" height="5" rx="1.4" />
        <rect x="9" y="64" width="27" height="27" rx="7" />
        <rect x="16" y="71" width="13" height="13" rx="3" fill="#fff" />
        <rect x="20" y="75" width="5" height="5" rx="1.4" />
        <rect x="45" y="11" width="9" height="9" rx="2.4" />
        <rect x="45" y="28" width="9" height="9" rx="2.4" />
        <rect x="43" y="44" width="11" height="11" rx="3" />
        <rect x="61" y="44" width="9" height="9" rx="2.4" />
        <rect x="76" y="46" width="13" height="13" rx="3.2" />
        <rect x="45" y="63" width="9" height="9" rx="2.4" />
        <rect x="61" y="65" width="11" height="11" rx="2.8" />
        <rect x="45" y="80" width="9" height="9" rx="2.4" />
        <rect x="79" y="79" width="12" height="12" rx="3" />
      </g>
      <!-- volt accent dot, signals "live" -->
      <rect x="44" y="45" width="7" height="7" rx="2" fill="#c8f238" />
    </svg>
  </div>
</template>

<style scoped>
.fakeqr {
  border: 1.5px solid var(--line-strong, #0e1110);
  border-radius: 12px;
  padding: 9px;
  background: #fff;
  display: flex;
}
.fakeqr svg { width: 100%; height: 100%; display: block; }
</style>

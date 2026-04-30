<template>
  <div class="value-widget">
    <div class="value-display" :class="{ 'has-value': rawValue != null }">
      <span class="pulse-dot" :class="{ active: pulsing }" />
      <span class="value-number font-mono">{{ displayValue }}</span>
    </div>
    <div v-if="widget.config?.unit" class="value-unit">{{ widget.config.unit }}</div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
const props = defineProps({ widget: Object, plcData: Object })
const pulsing = ref(false)
let pulseTimer = null
const rawValue = computed(() => {
  if (!props.widget?.tagName || !props.plcData) return null
  return props.plcData[props.widget.tagName] ?? null
})
const displayValue = computed(() => rawValue.value != null ? String(rawValue.value) : '—')
watch(rawValue, () => {
  pulsing.value = true
  clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => { pulsing.value = false }, 600)
})
</script>
<style scoped>
.value-widget { text-align: center; padding: 8px 0; }
.value-display { position: relative; display: inline-flex; align-items: center; gap: 10px; }
.value-number {
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--va-primary);
  letter-spacing: -1px;
}
.has-value .value-number { color: #2dd4bf; }
.value-unit { margin-top: 4px; font-size: 0.8rem; color: var(--va-text-secondary); text-transform: uppercase; letter-spacing: 1px; }
.pulse-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #6b7280; flex-shrink: 0;
  transition: background 0.3s;
}
.pulse-dot.active {
  background: #2dd4bf;
  animation: pulse-anim 0.6s ease-out;
}
@keyframes pulse-anim {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(45,212,191,0.7); }
  50% { transform: scale(1.5); box-shadow: 0 0 0 8px rgba(45,212,191,0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(45,212,191,0); }
}
</style>

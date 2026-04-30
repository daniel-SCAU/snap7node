<template>
  <div class="text-center">
    <div class="gauge-wrap">
      <svg viewBox="0 0 120 70" class="gauge-svg">
        <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#e5e7eb" stroke-width="10" stroke-linecap="round"/>
        <path d="M10,60 A50,50 0 0,1 110,60" fill="none" :stroke="gaugeColor" stroke-width="10" stroke-linecap="round"
              :stroke-dasharray="arcLength" :stroke-dashoffset="arcOffset" />
      </svg>
      <div class="gauge-value va-h5 font-mono">{{ displayValue }}</div>
    </div>
    <div v-if="widget.config?.unit" class="va-text-secondary text-sm">{{ widget.config.unit }}</div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ widget: Object, plcData: Object })
const ARC = 157
const rawValue = computed(() => {
  if (!props.widget.tagName || !props.plcData) return null
  return props.plcData[props.widget.tagName]
})
const pct = computed(() => {
  const v = rawValue.value
  if (v == null) return 0
  return Math.min(100, Math.max(0, typeof v === 'number' ? v : 0))
})
const arcLength = ARC
const arcOffset = computed(() => ARC - (pct.value / 100) * ARC)
const displayValue = computed(() => rawValue.value != null ? String(rawValue.value) : '—')
const gaugeColor = computed(() => pct.value > 66 ? '#10b981' : pct.value > 33 ? '#f59e0b' : '#ef4444')
</script>
<style scoped>
.gauge-wrap { position: relative; display: inline-block; }
.gauge-svg { width: 120px; height: 70px; }
.gauge-value { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); }
</style>

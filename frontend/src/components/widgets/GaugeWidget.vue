<template>
  <div class="gauge-widget">
    <svg viewBox="0 0 200 120" class="gauge-svg">
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#10b981"/>
          <stop offset="50%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#ef4444"/>
        </linearGradient>
      </defs>
      <!-- Track -->
      <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="#374151" stroke-width="14" stroke-linecap="round"/>
      <!-- Fill -->
      <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="url(#gaugeGrad)" stroke-width="14"
            stroke-linecap="round"
            :stroke-dasharray="ARC_LEN"
            :stroke-dashoffset="arcOffset" />
      <!-- Value text -->
      <text x="100" y="95" text-anchor="middle" class="gauge-val-text" font-size="22" font-weight="700" fill="currentColor">{{ displayValue }}</text>
      <text v-if="widget.config?.unit" x="100" y="113" text-anchor="middle" font-size="10" fill="#6b7280">{{ widget.config.unit }}</text>
    </svg>
    <div class="gauge-minmax">
      <span>{{ minVal }}</span>
      <span>{{ maxVal }}</span>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ widget: Object, plcData: Object })
const ARC_LEN = 251.3 // π * 80 * (180/180) ≈ 251.3

const minVal = computed(() => props.widget.config?.min ?? 0)
const maxVal = computed(() => props.widget.config?.max ?? 100)

const rawValue = computed(() => {
  if (!props.widget?.tagName || !props.plcData) return null
  return props.plcData[props.widget.tagName] ?? null
})

const pct = computed(() => {
  const v = rawValue.value
  if (v == null || typeof v !== 'number') return 0
  const range = maxVal.value - minVal.value
  if (range === 0) return 0
  return Math.min(100, Math.max(0, ((v - minVal.value) / range) * 100))
})

const arcOffset = computed(() => ARC_LEN - (pct.value / 100) * ARC_LEN)
const displayValue = computed(() => rawValue.value != null ? String(rawValue.value) : '—')
</script>
<style scoped>
.gauge-widget { text-align: center; }
.gauge-svg { width: 100%; max-width: 200px; height: auto; }
.gauge-minmax { display: flex; justify-content: space-between; font-size: 0.7rem; color: #6b7280; max-width: 200px; margin: 0 auto; padding: 0 4px; }
.gauge-val-text { font-family: monospace; }
</style>

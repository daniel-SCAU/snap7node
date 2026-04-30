<template>
  <div class="progress-widget">
    <div class="progress-header">
      <span class="font-mono font-bold" style="font-size:1.5rem; color:var(--va-primary)">{{ displayValue }}</span>
      <span v-if="widget.config?.unit" style="font-size:0.85rem; color:#6b7280; margin-left:4px">{{ widget.config.unit }}</span>
      <span class="ml-auto font-bold" :style="{ color: barColor }">{{ pct }}%</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: pct + '%', background: barColor }" />
    </div>
    <div class="progress-labels">
      <span>{{ minVal }}</span><span>{{ maxVal }}</span>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ widget: Object, plcData: Object })
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
  return Math.min(100, Math.max(0, Math.round(((v - minVal.value) / range) * 100)))
})
const displayValue = computed(() => rawValue.value != null ? String(rawValue.value) : '—')
const barColor = computed(() => pct.value > 66 ? '#10b981' : pct.value > 33 ? '#f59e0b' : '#ef4444')
</script>
<style scoped>
.progress-widget { padding: 4px 0; }
.progress-header { display: flex; align-items: baseline; gap: 4px; margin-bottom: 8px; }
.progress-track { height: 12px; background: #1f2937; border-radius: 6px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 6px; transition: width 0.5s ease, background 0.3s; }
.progress-labels { display: flex; justify-content: space-between; font-size: 0.7rem; color: #6b7280; margin-top: 4px; }
</style>

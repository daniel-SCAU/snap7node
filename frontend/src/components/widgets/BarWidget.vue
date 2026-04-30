<template>
  <div>
    <div class="flex justify-between mb-1">
      <span class="va-text-secondary text-sm">{{ displayValue }}{{ widget.config?.unit ? ' ' + widget.config.unit : '' }}</span>
      <span class="va-text-secondary text-sm">{{ pct }}%</span>
    </div>
    <VaProgressBar :model-value="pct" color="primary" />
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ widget: Object, plcData: Object })
const rawValue = computed(() => {
  if (!props.widget.tagName || !props.plcData) return null
  return props.plcData[props.widget.tagName]
})
const displayValue = computed(() => rawValue.value != null ? String(rawValue.value) : '—')
const pct = computed(() => {
  const v = rawValue.value
  if (v == null) return 0
  return Math.min(100, Math.max(0, typeof v === 'number' ? v : 0))
})
</script>

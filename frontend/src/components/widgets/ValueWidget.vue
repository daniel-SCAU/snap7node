<template>
  <div class="text-center py-2">
    <div class="va-h3 font-mono">{{ displayValue }}</div>
    <div v-if="widget.config?.unit" class="va-text-secondary text-sm">{{ widget.config.unit }}</div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ widget: Object, plcData: Object })
const displayValue = computed(() => {
  if (!props.widget.tagName || !props.plcData) return '—'
  const v = props.plcData[props.widget.tagName]
  return v != null ? String(v) : '—'
})
</script>

<template>
  <div class="bool-widget">
    <div class="led" :class="isOn ? 'on' : 'off'">
      <div class="led-inner" />
    </div>
    <div class="bool-label" :style="{ color: isOn ? '#10b981' : '#ef4444' }">
      {{ isOn ? 'ON' : 'OFF' }}
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ widget: Object, plcData: Object })
const rawValue = computed(() => {
  if (!props.widget?.tagName || !props.plcData) return null
  return props.plcData[props.widget.tagName] ?? null
})
const isOn = computed(() => {
  const v = rawValue.value
  return v === true || v === 1 || v === '1' || v === 'true'
})
</script>
<style scoped>
.bool-widget { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 0; gap: 10px; }
.led { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.led.on { background: rgba(16,185,129,0.2); box-shadow: 0 0 24px rgba(16,185,129,0.6); animation: pulse-on 2s infinite; }
.led.off { background: rgba(239,68,68,0.15); box-shadow: 0 0 12px rgba(239,68,68,0.3); }
.led-inner { width: 40px; height: 40px; border-radius: 50%; }
.led.on .led-inner { background: #10b981; box-shadow: 0 0 12px #10b981; }
.led.off .led-inner { background: #ef4444; }
.bool-label { font-size: 1.2rem; font-weight: 800; letter-spacing: 2px; }
@keyframes pulse-on {
  0%, 100% { box-shadow: 0 0 24px rgba(16,185,129,0.6); }
  50% { box-shadow: 0 0 40px rgba(16,185,129,0.9); }
}
</style>

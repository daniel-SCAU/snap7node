<template>
  <div style="position:relative">
    <Doughnut :data="chartData" :options="chartOptions" style="max-height:220px" />
    <div class="doughnut-center">
      <span class="font-mono font-bold" style="font-size:1.1rem">{{ total }}</span>
      <span style="font-size:0.65rem; color:#6b7280">TOTAL</span>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({ widget: Object, plcData: Object })
const DEFAULT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

const values = computed(() => (props.widget?.tags ?? []).map(t => props.plcData?.[t.tagName] ?? 0))
const total = computed(() => values.value.reduce((a, b) => a + Number(b), 0).toLocaleString())

const chartData = computed(() => ({
  labels: (props.widget?.tags ?? []).map(t => t.label || t.tagName),
  datasets: [{
    data: values.value,
    backgroundColor: (props.widget?.tags ?? []).map((t, i) => t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
    borderWidth: 2,
    borderColor: '#1f2937',
  }],
}))

const chartOptions = {
  responsive: true,
  cutout: '65%',
  animation: { duration: 300 },
  plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } },
}
</script>
<style scoped>
.doughnut-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -60%);
  display: flex; flex-direction: column; align-items: center;
  pointer-events: none;
}
</style>

<template>
  <Pie :data="chartData" :options="chartOptions" style="max-height:220px" />
</template>
<script setup>
import { computed } from 'vue'
import { Pie } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({ widget: Object, plcData: Object })
const DEFAULT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

const chartData = computed(() => ({
  labels: (props.widget?.tags ?? []).map(t => t.label || t.tagName),
  datasets: [{
    data: (props.widget?.tags ?? []).map(t => props.plcData?.[t.tagName] ?? 0),
    backgroundColor: (props.widget?.tags ?? []).map((t, i) => t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
    borderWidth: 2,
    borderColor: '#1f2937',
  }],
}))

const chartOptions = {
  responsive: true,
  animation: { duration: 300 },
  plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } },
}
</script>

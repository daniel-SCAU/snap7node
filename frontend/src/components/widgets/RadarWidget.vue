<template>
  <Radar :data="chartData" :options="chartOptions" style="max-height:220px" />
</template>
<script setup>
import { computed } from 'vue'
import { Radar } from 'vue-chartjs'
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const props = defineProps({ widget: Object, plcData: Object })

const chartData = computed(() => ({
  labels: (props.widget?.tags ?? []).map(t => t.label || t.tagName),
  datasets: [{
    label: props.widget?.label ?? 'Values',
    data: (props.widget?.tags ?? []).map(t => props.plcData?.[t.tagName] ?? 0),
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderColor: 'rgba(99,102,241,1)',
    pointBackgroundColor: 'rgba(99,102,241,1)',
    borderWidth: 2,
    pointRadius: 3,
  }],
}))

const chartOptions = {
  responsive: true,
  animation: { duration: 300 },
  plugins: { legend: { display: false } },
  scales: {
    r: {
      angleLines: { color: 'rgba(255,255,255,0.1)' },
      grid: { color: 'rgba(255,255,255,0.1)' },
      pointLabels: { font: { size: 10 }, color: '#9ca3af' },
      ticks: { backdropColor: 'transparent', color: '#6b7280', font: { size: 9 } },
    },
  },
}
</script>

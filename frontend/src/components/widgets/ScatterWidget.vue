<template>
  <Scatter :data="chartData" :options="chartOptions" style="max-height:220px" />
</template>
<script setup>
import { ref, computed, watch } from 'vue'
import { Scatter } from 'vue-chartjs'
import {
  Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend
} from 'chart.js'

ChartJS.register(LinearScale, PointElement, Tooltip, Legend)

const props = defineProps({ widget: Object, plcData: Object })

const historyLen = computed(() => props.widget?.config?.historyLength ?? 50)
const points = ref([])

watch(() => props.plcData, (data) => {
  if (!data) return
  const xTag = props.widget?.config?.xTag
  const yTag = props.widget?.config?.yTag
  if (!xTag || !yTag) return
  const x = data[xTag]
  const y = data[yTag]
  if (x == null || y == null) return
  const len = historyLen.value
  points.value = [...points.value.slice(-(len - 1)), { x, y }]
})

const chartData = computed(() => ({
  datasets: [{
    label: props.widget?.label ?? 'Scatter',
    data: points.value,
    backgroundColor: 'rgba(99,102,241,0.7)',
    pointRadius: 4,
  }],
}))

const chartOptions = {
  responsive: true,
  animation: { duration: 200 },
  plugins: { legend: { display: false } },
  scales: {
    x: { type: 'linear', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: { size: 10 } } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: { size: 10 } } },
  },
}
</script>

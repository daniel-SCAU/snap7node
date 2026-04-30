<template>
  <Line :data="chartData" :options="chartOptions" style="max-height:220px" />
</template>
<script setup>
import { ref, computed, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = defineProps({ widget: Object, plcData: Object })

const historyLen = computed(() => props.widget?.config?.historyLength ?? 30)
const history = ref([])
const labels = ref([])

watch(() => props.plcData, (data) => {
  if (!data || !props.widget?.tagName) return
  const v = data[props.widget.tagName]
  if (v == null) return
  const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const len = historyLen.value
  history.value = [...history.value.slice(-(len - 1)), v]
  labels.value = [...labels.value.slice(-(len - 1)), label]
})

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [{
    label: props.widget?.label ?? 'Value',
    data: history.value,
    borderColor: 'rgba(99,102,241,1)',
    backgroundColor: 'rgba(99,102,241,0.15)',
    fill: true,
    tension: 0.4,
    pointRadius: 0,
    borderWidth: 2,
  }],
}))

const chartOptions = {
  responsive: true,
  animation: { duration: 300 },
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
    y: { beginAtZero: false, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: { size: 10 } } },
  },
}
</script>

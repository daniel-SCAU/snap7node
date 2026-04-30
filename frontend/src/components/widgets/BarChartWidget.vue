<template>
  <Bar :data="chartData" :options="chartOptions" style="max-height:220px" />
</template>
<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps({ widget: Object, plcData: Object })

const DEFAULT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

const chartData = computed(() => {
  if (props.widget?.tags?.length) {
    return {
      labels: props.widget.tags.map(t => t.label || t.tagName),
      datasets: [{
        label: props.widget.label ?? 'Values',
        data: props.widget.tags.map((t, i) => props.plcData?.[t.tagName] ?? 0),
        backgroundColor: props.widget.tags.map((t, i) => t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
        borderRadius: 4,
      }],
    }
  }
  return {
    labels: [props.widget?.label ?? 'Value'],
    datasets: [{
      label: props.widget?.label ?? 'Value',
      data: [props.plcData?.[props.widget?.tagName] ?? 0],
      backgroundColor: [DEFAULT_COLORS[0]],
      borderRadius: 4,
    }],
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  indexAxis: props.widget?.config?.horizontal ? 'y' : 'x',
  animation: { duration: 300 },
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: { size: 10 } } },
    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: { size: 10 } } },
  },
}))
</script>

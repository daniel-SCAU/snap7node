<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2 class="va-h4">Production Dashboard</h2>
      <VaButton @click="showBatchModal = true" icon="add">New Batch</VaButton>
    </div>

    <!-- Read result indicators -->
    <div class="grid gap-4 mb-4" style="grid-template-columns: 1fr 1fr auto">
      <VaCard :color="lastReadGood ? 'success' : 'backgroundSecondary'">
        <VaCardContent class="flex items-center gap-3">
          <span style="font-size:2rem">✅</span>
          <div>
            <div class="va-text-secondary text-xs uppercase font-bold">Good Read</div>
            <div class="font-bold">{{ lastReadGood ? 'Active – GOOD READ' : 'Inactive' }}</div>
          </div>
        </VaCardContent>
      </VaCard>
      <VaCard :color="lastReadBad ? 'danger' : 'backgroundSecondary'">
        <VaCardContent class="flex items-center gap-3">
          <span style="font-size:2rem">❌</span>
          <div>
            <div class="va-text-secondary text-xs uppercase font-bold">Bad Read</div>
            <div class="font-bold">{{ lastReadBad ? 'Active – BAD READ' : 'Inactive' }}</div>
          </div>
        </VaCardContent>
      </VaCard>
      <VaChip :color="visionEnabled ? 'success' : 'secondary'">
        {{ visionEnabled ? '● Vision Enabled' : '○ Vision Disabled' }}
      </VaChip>
    </div>

    <!-- Metrics grid -->
    <p class="va-text-secondary text-xs uppercase font-bold tracking-widest mb-2">Production Metrics</p>
    <div class="grid gap-3 mb-4" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))">
      <VaCard v-for="m in metrics" :key="m.key" class="metric-card">
        <VaCardContent>
          <div class="metric-icon">{{ m.icon }}</div>
          <div class="va-text-secondary text-xs uppercase font-bold mb-1">{{ m.label }}</div>
          <div class="va-h5 font-mono">{{ m.value }}</div>
          <div class="va-text-secondary" style="font-size:0.7rem">{{ m.subtitle }}</div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Quality progress bar -->
    <VaCard class="mb-4">
      <VaCardContent>
        <div class="flex justify-between mb-2">
          <span class="font-bold">Read Quality Rate</span>
          <span class="font-bold">{{ qualityPct }}%</span>
        </div>
        <VaProgressBar :model-value="qualityPct" :color="qualityPct < 80 ? 'warning' : 'success'" />
        <div class="flex justify-between mt-1 va-text-secondary text-sm">
          <span>Good: {{ fmt(plcData?.goodReads) }}</span>
          <span>Total: {{ fmt((plcData?.goodReads ?? 0) + (plcData?.badReads ?? 0)) }}</span>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- 2-col: info panels + camera -->
    <div class="grid gap-4 mb-4" style="grid-template-columns: 1fr 1fr">

      <!-- Batch Data -->
      <VaCard>
        <VaCardTitle>Batch Data</VaCardTitle>
        <VaCardContent>
          <div v-for="row in batchRows" :key="row.label" class="info-row">
            <span class="va-text-secondary text-sm">{{ row.label }}</span>
            <span class="font-mono text-sm">{{ row.value }}</span>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- OEE Data -->
      <VaCard>
        <VaCardTitle>OEE Data</VaCardTitle>
        <VaCardContent>
          <div v-for="row in oeeRows" :key="row.label" class="info-row">
            <span class="va-text-secondary text-sm">{{ row.label }}</span>
            <span class="font-mono text-sm">{{ row.value }}</span>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Camera + Chart -->
    <div class="grid gap-4" style="grid-template-columns: 1fr 1fr">
      <VaCard>
        <VaCardTitle class="flex items-center justify-between">
          <span>Zebra FS42 · <code style="font-size:0.8rem">{{ cameraIp }}</code></span>
          <VaBadge :color="cameraOnline ? 'success' : 'danger'" :text="cameraOnline ? 'Live' : 'Offline'" />
        </VaCardTitle>
        <VaCardContent style="padding:0">
          <div style="position:relative;height:300px">
            <iframe
              ref="cameraIframeRef"
              :src="cameraUrl || 'about:blank'"
              style="width:100%;height:100%;border:none;display:block"
              @load="cameraOnline = true"
              @error="cameraOnline = false"
            />
            <div v-if="!cameraUrl" class="camera-overlay-text">No camera URL configured</div>
          </div>
        </VaCardContent>
      </VaCard>

      <div style="display:flex;flex-direction:column;gap:16px">
        <!-- Trigger info -->
        <VaCard>
          <VaCardTitle>Trigger &amp; Scan Info</VaCardTitle>
          <VaCardContent>
            <div v-for="row in triggerRows" :key="row.label" class="info-row">
              <span class="va-text-secondary text-sm">{{ row.label }}</span>
              <span class="font-mono text-sm">{{ row.value }}</span>
            </div>
          </VaCardContent>
        </VaCard>

        <!-- Chart -->
        <VaCard>
          <VaCardTitle>Read History (last 30 points)</VaCardTitle>
          <VaCardContent>
            <LineChart :data="chartData" :options="chartOptions" style="max-height:150px" />
          </VaCardContent>
        </VaCard>
      </div>
    </div>

    <!-- New Batch Modal -->
    <VaModal v-model="showBatchModal" title="New Batch" hide-default-actions>
      <p class="va-text-secondary mb-3">Enter the MES Batch number (writes to MD100)</p>
      <div class="keypad-display mb-3">{{ keypadValue }}</div>
      <div class="keypad-grid mb-3">
        <VaButton v-for="k in [7,8,9,4,5,6,1,2,3]" :key="k" preset="secondary" @click="keypadPress(String(k))">{{ k }}</VaButton>
        <VaButton preset="secondary" @click="keypadPress('0')" style="grid-column:span 2">0</VaButton>
        <VaButton preset="secondary" @click="keypadBackspace" icon="backspace" />
      </div>
      <div class="flex gap-2 justify-end">
        <VaButton preset="secondary" @click="showBatchModal = false">Cancel</VaButton>
        <VaButton @click="confirmNewBatch">Confirm</VaButton>
      </div>
    </VaModal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'vuestic-ui'
import { Line as LineChart } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js'
import { useSocket } from '@/composables/useSocket'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const { state } = useSocket()
const { init: initToast } = useToast()
const toast = initToast()

const plcData = computed(() => state.data)

const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString() : String(v))
const fmtId = (v) => (v == null ? '—' : String(v))
const fmtPct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%')

const lastReadGood = computed(() => plcData.value?.lastReadGood ?? false)
const lastReadBad  = computed(() => plcData.value?.lastReadBad ?? false)
const visionEnabled = computed(() => plcData.value?.enableVision ?? false)

const metrics = computed(() => [
  { key: 'goodReads',    label: 'Good Reads',    icon: '✅', value: fmt(plcData.value?.goodReads),    subtitle: 'Successful scans' },
  { key: 'badReads',     label: 'Bad Reads',     icon: '❌', value: fmt(plcData.value?.badReads),     subtitle: 'Failed scans' },
  { key: 'totalBags',    label: 'Total Bags',    icon: '📦', value: fmt(plcData.value?.totalBags),    subtitle: 'Processed units' },
  { key: 'currentBatch', label: 'Current Batch', icon: '🏷️', value: fmtId(plcData.value?.currentBatch), subtitle: 'Active batch ID' },
  { key: 'mesBatch',     label: 'MES Batch',     icon: '🔗', value: fmtId(plcData.value?.mesBatch),  subtitle: 'MES reference' },
  { key: 'ocrCode',      label: 'OCR Code',      icon: '🔎', value: fmtId(plcData.value?.actualBatchCodeOCR), subtitle: 'Last read code' },
  { key: 'oee',          label: 'OEE',           icon: '📊', value: plcData.value?.oee != null ? fmtPct(plcData.value.oee) : '—', subtitle: 'Equipment effectiveness' },
])

const qualityPct = computed(() => {
  const g = plcData.value?.goodReads ?? 0
  const b = plcData.value?.badReads  ?? 0
  const t = g + b
  return t > 0 ? Math.round((g / t) * 100) : 0
})

const batchRows = computed(() => [
  { label: 'Batch ID',          value: plcData.value?.batchStr ?? '—' },
  { label: 'Prod Date',         value: plcData.value?.lastBatchStartStr ?? '—' },
  { label: 'Prod Date (DInt)',  value: fmtId(plcData.value?.prodDateDInt) },
  { label: 'Before Date',       value: plcData.value?.lastBatchBBStr ?? '—' },
  { label: 'Before Date (DInt)',value: fmtId(plcData.value?.beforeDateDInt) },
  { label: 'Bag No',            value: plcData.value?.lastBagNo ?? '—' },
  { label: 'Bag No (DInt)',     value: fmtId(plcData.value?.bagNoDInt) },
])

const oeeRows = computed(() => [
  { label: 'Last Good Count Total',   value: fmt(plcData.value?.lastGoodCountTotal) },
  { label: 'Last Reject Count Total', value: fmt(plcData.value?.lastRejectCountTotal) },
  { label: 'Delta Good',              value: fmt(plcData.value?.deltaGood) },
  { label: 'Delta Reject',            value: fmt(plcData.value?.deltaReject) },
  { label: 'Internal Timestamp (s)',  value: plcData.value?.internalTimestamp_s?.toFixed(3) ?? '—' },
  { label: 'Log Timer (s)',           value: plcData.value?.logTimer_s?.toFixed(3) ?? '—' },
  { label: 'Log Sequence',            value: fmt(plcData.value?.logSequence) },
  { label: 'Availability',            value: fmtPct(plcData.value?.availability) },
  { label: 'Performance',             value: fmtPct(plcData.value?.performance) },
  { label: 'Quality',                 value: fmtPct(plcData.value?.quality) },
  { label: 'OEE',                     value: fmtPct(plcData.value?.oee) },
])

// Camera
const cameraUrl = ref('')
const cameraIp  = ref('192.168.1.73')
const cameraOnline = ref(false)

const triggerRows = computed(() => [
  { label: 'Trigger Offset',  value: fmt(plcData.value?.triggerOffset) },
  { label: 'Enable Vision',   value: plcData.value?.enableVision ? 'ON' : 'OFF' },
  { label: 'Actual OCR Code', value: fmtId(plcData.value?.actualBatchCodeOCR) },
  { label: 'Current Batch',   value: fmtId(plcData.value?.currentBatch) },
  { label: 'MES Batch',       value: fmtId(plcData.value?.mesBatch) },
])

// Chart history
const HISTORY_LEN = 30
const historyGood   = ref(Array(HISTORY_LEN).fill(null))
const historyBad    = ref(Array(HISTORY_LEN).fill(null))
const historyLabels = ref(Array(HISTORY_LEN).fill(''))

const chartData = computed(() => ({
  labels: historyLabels.value,
  datasets: [
    { label: 'Good Reads', data: historyGood.value, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
    { label: 'Bad Reads',  data: historyBad.value,  borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',  fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
  ],
}))

const chartOptions = {
  responsive: true,
  animation: { duration: 300 },
  plugins: { legend: { labels: { font: { size: 11 }, boxWidth: 10 } } },
  scales: { y: { beginAtZero: true } },
}

watch(() => state.data, (data) => {
  if (!data) return
  const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  historyGood.value = [...historyGood.value.slice(1), data.goodReads]
  historyBad.value  = [...historyBad.value.slice(1), data.badReads]
  historyLabels.value = [...historyLabels.value.slice(1), label]
})

// Toast on read events — use refs to keep state local to this component instance
const prevGood = ref(null)
const prevBad  = ref(null)
watch(() => state.data, (data) => {
  if (!data) return
  if (prevGood.value !== null && !prevGood.value && data.lastReadGood) toast({ message: '✅ Good Read detected!', color: 'success', duration: 3000 })
  if (prevBad.value  !== null && !prevBad.value  && data.lastReadBad)  toast({ message: '❌ Bad Read detected!',  color: 'danger',  duration: 3000 })
  prevGood.value = data.lastReadGood
  prevBad.value  = data.lastReadBad
})

// New Batch keypad
const showBatchModal = ref(false)
const keypadValue = ref('0')

function keypadPress(k) {
  if (keypadValue.value === '0') { keypadValue.value = k; return }
  if (keypadValue.value.length < 10) {
    const next = keypadValue.value + k
    if (parseInt(next, 10) <= 2147483647) keypadValue.value = next
  }
}

function keypadBackspace() {
  keypadValue.value = keypadValue.value.length <= 1 ? '0' : keypadValue.value.slice(0, -1)
}

async function confirmNewBatch() {
  const num = parseInt(keypadValue.value, 10)
  if (!Number.isFinite(num) || num < -2147483648 || num > 2147483647) {
    toast({ message: 'Value must be a valid 32-bit integer', color: 'danger' })
    return
  }
  try {
    const res = await fetch('/api/plc/mes-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: num }),
    })
    const json = await res.json()
    if (json.ok) {
      toast({ message: `MES Batch set to ${num}`, color: 'success' })
      showBatchModal.value = false
      keypadValue.value = '0'
    } else {
      toast({ message: 'Write failed: ' + json.error, color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Write error: ' + e.message, color: 'danger' })
  }
}

onMounted(async () => {
  try {
    const res = await fetch('/api/settings')
    const s = await res.json()
    cameraUrl.value = s.cameraUrl || ''
    if (s.cameraUrl) {
      try { cameraIp.value = new URL(s.cameraUrl).hostname } catch (_) {}
    }
  } catch (_) { cameraUrl.value = 'http://192.168.1.73/' }
})
</script>

<style scoped>
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--va-background-border);
}
.info-row:last-child { border-bottom: none; }
.metric-card { position: relative; }
.metric-icon { position: absolute; right: 12px; top: 12px; font-size: 1.4rem; opacity: 0.25; }
.keypad-display {
  background: var(--va-background-secondary);
  border: 1px solid var(--va-background-border);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 2rem;
  font-weight: 700;
  text-align: right;
  font-family: monospace;
  min-height: 60px;
}
.keypad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.camera-overlay-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--va-text-secondary);
}
</style>

<template>
  <div>
    <!-- Page header -->
    <div class="dash-header">
      <div>
        <h2 class="va-h4">Production Dashboard</h2>
        <p class="va-text-secondary text-sm">Real-time monitoring of the Siemens S7-1200 PLC</p>
      </div>
      <VaButton @click="showBatchModal = true" icon="add">New Batch</VaButton>
    </div>

    <!-- KPI Row -->
    <div class="kpi-grid mb-5">
      <div v-for="kpi in kpis" :key="kpi.key" class="kpi-card" :style="kpi.style">
        <div class="kpi-icon">{{ kpi.icon }}</div>
        <div class="kpi-value font-mono">{{ kpi.value }}</div>
        <div class="kpi-label">{{ kpi.label }}</div>
      </div>
    </div>

    <!-- Read result + vision status -->
    <div class="read-row mb-5">
      <div class="read-card" :class="lastReadGood ? 'read-good' : 'read-inactive'">
        <div class="read-led" :class="lastReadGood ? 'led-green' : 'led-off'" />
        <div>
          <div class="read-title">Good Read</div>
          <div class="read-sub">{{ lastReadGood ? 'ACTIVE' : 'Inactive' }}</div>
        </div>
      </div>
      <div class="read-card" :class="lastReadBad ? 'read-bad' : 'read-inactive'">
        <div class="read-led" :class="lastReadBad ? 'led-red' : 'led-off'" />
        <div>
          <div class="read-title">Bad Read</div>
          <div class="read-sub">{{ lastReadBad ? 'ACTIVE' : 'Inactive' }}</div>
        </div>
      </div>
      <div class="vision-chip" :class="visionEnabled ? 'vision-on' : 'vision-off'">
        <span class="status-dot" />
        Vision {{ visionEnabled ? 'Enabled' : 'Disabled' }}
      </div>
    </div>

    <!-- Quality progress -->
    <VaCard class="mb-5">
      <VaCardContent>
        <div class="quality-header">
          <span class="font-bold">Read Quality Rate</span>
          <span class="quality-pct font-mono" :style="{ color: qualityPct >= 80 ? '#10b981' : '#f59e0b' }">{{ qualityPct }}%</span>
        </div>
        <VaProgressBar :model-value="qualityPct" :color="qualityPct < 80 ? 'warning' : 'success'" style="margin: 10px 0" />
        <div class="quality-footer va-text-secondary text-sm">
          <span>✅ Good: {{ fmt(plcData?.goodReads) }}</span>
          <span>❌ Bad: {{ fmt(plcData?.badReads) }}</span>
          <span>Total: {{ fmt((plcData?.goodReads ?? 0) + (plcData?.badReads ?? 0)) }}</span>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- 2-column info panels -->
    <div class="two-col mb-5">
      <VaCard>
        <VaCardTitle>
          <VaIcon name="inventory_2" size="18px" style="margin-right:6px;opacity:0.7" />
          Batch Data
        </VaCardTitle>
        <VaCardContent>
          <div v-for="row in batchRows" :key="row.label" class="info-row">
            <span class="va-text-secondary text-sm">{{ row.label }}</span>
            <span class="font-mono text-sm">{{ row.value }}</span>
          </div>
        </VaCardContent>
      </VaCard>

      <VaCard>
        <VaCardTitle>
          <VaIcon name="analytics" size="18px" style="margin-right:6px;opacity:0.7" />
          OEE Data
        </VaCardTitle>
        <VaCardContent>
          <div v-for="row in oeeRows" :key="row.label" class="info-row">
            <span class="va-text-secondary text-sm">{{ row.label }}</span>
            <span class="font-mono text-sm">{{ row.value }}</span>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Camera + Trigger + Chart -->
    <div class="two-col">
      <VaCard>
        <VaCardTitle class="flex items-center justify-between">
          <span>
            <VaIcon name="videocam" size="18px" style="margin-right:6px;opacity:0.7" />
            Zebra FS42 · <code style="font-size:0.8rem">{{ cameraIp }}</code>
          </span>
          <div class="status-badge" :class="cameraOnline ? 'status-ok' : 'status-err'" style="font-size:0.7rem;padding:2px 8px">
            <span class="status-dot" />
            {{ cameraOnline ? 'Live' : 'Offline' }}
          </div>
        </VaCardTitle>
        <VaCardContent style="padding:0">
          <div style="position:relative;height:300px;background:#0a0a0a">
            <iframe
              :src="cameraUrl || 'about:blank'"
              style="width:100%;height:100%;border:none;display:block"
              @load="cameraOnline = true"
              @error="cameraOnline = false"
            />
            <div v-if="!cameraUrl" class="camera-empty">
              <VaIcon name="videocam_off" size="32px" color="secondary" />
              <span class="va-text-secondary text-sm mt-2">No camera URL configured</span>
            </div>
          </div>
        </VaCardContent>
      </VaCard>

      <div class="flex flex-col gap-4">
        <VaCard>
          <VaCardTitle>
            <VaIcon name="sensors" size="18px" style="margin-right:6px;opacity:0.7" />
            Trigger &amp; Scan Info
          </VaCardTitle>
          <VaCardContent>
            <div v-for="row in triggerRows" :key="row.label" class="info-row">
              <span class="va-text-secondary text-sm">{{ row.label }}</span>
              <span class="font-mono text-sm">{{ row.value }}</span>
            </div>
          </VaCardContent>
        </VaCard>

        <VaCard style="flex:1">
          <VaCardTitle>
            <VaIcon name="show_chart" size="18px" style="margin-right:6px;opacity:0.7" />
            Read History (last 30 points)
          </VaCardTitle>
          <VaCardContent>
            <LineChart :data="chartData" :options="chartOptions" style="max-height:160px" />
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
const fmtId  = (v) => (v == null ? '—' : String(v))
const fmtPct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%')

const lastReadGood  = computed(() => plcData.value?.lastReadGood  ?? false)
const lastReadBad   = computed(() => plcData.value?.lastReadBad   ?? false)
const visionEnabled = computed(() => plcData.value?.enableVision  ?? false)

const kpis = computed(() => [
  { key: 'good',  label: 'Good Reads', icon: '✅', value: fmt(plcData.value?.goodReads),  style: '--kpi-color:#10b981' },
  { key: 'bad',   label: 'Bad Reads',  icon: '❌', value: fmt(plcData.value?.badReads),   style: '--kpi-color:#ef4444' },
  { key: 'bags',  label: 'Total Bags', icon: '📦', value: fmt(plcData.value?.totalBags),  style: '--kpi-color:#6366f1' },
  { key: 'oee',   label: 'OEE',        icon: '📊', value: plcData.value?.oee != null ? fmtPct(plcData.value.oee) : '—', style: '--kpi-color:#f59e0b' },
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
  { label: 'Last Good Total',     value: fmt(plcData.value?.lastGoodCountTotal) },
  { label: 'Last Reject Total',   value: fmt(plcData.value?.lastRejectCountTotal) },
  { label: 'Delta Good',          value: fmt(plcData.value?.deltaGood) },
  { label: 'Delta Reject',        value: fmt(plcData.value?.deltaReject) },
  { label: 'Internal TS (s)',     value: plcData.value?.internalTimestamp_s?.toFixed(3) ?? '—' },
  { label: 'Log Timer (s)',       value: plcData.value?.logTimer_s?.toFixed(3) ?? '—' },
  { label: 'Log Sequence',        value: fmt(plcData.value?.logSequence) },
  { label: 'Availability',        value: fmtPct(plcData.value?.availability) },
  { label: 'Performance',         value: fmtPct(plcData.value?.performance) },
  { label: 'Quality',             value: fmtPct(plcData.value?.quality) },
  { label: 'OEE',                 value: fmtPct(plcData.value?.oee) },
])

const cameraUrl    = ref('')
const cameraIp     = ref('192.168.1.73')
const cameraOnline = ref(false)

const triggerRows = computed(() => [
  { label: 'Trigger Offset',  value: fmt(plcData.value?.triggerOffset) },
  { label: 'Enable Vision',   value: plcData.value?.enableVision ? 'ON' : 'OFF' },
  { label: 'Actual OCR Code', value: fmtId(plcData.value?.actualBatchCodeOCR) },
  { label: 'Current Batch',   value: fmtId(plcData.value?.currentBatch) },
  { label: 'MES Batch',       value: fmtId(plcData.value?.mesBatch) },
])

const HISTORY_LEN   = 30
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
  plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 10 } } },
  scales: {
    x: { ticks: { font: { size: 9 }, maxTicksLimit: 5 }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 9 } } },
  },
}

watch(() => state.data, (data) => {
  if (!data) return
  const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  historyGood.value   = [...historyGood.value.slice(1), data.goodReads]
  historyBad.value    = [...historyBad.value.slice(1), data.badReads]
  historyLabels.value = [...historyLabels.value.slice(1), label]
})

const prevGood = ref(null)
const prevBad  = ref(null)
watch(() => state.data, (data) => {
  if (!data) return
  if (prevGood.value !== null && !prevGood.value && data.lastReadGood) toast({ message: '✅ Good Read detected!', color: 'success', duration: 3000 })
  if (prevBad.value  !== null && !prevBad.value  && data.lastReadBad)  toast({ message: '❌ Bad Read detected!',  color: 'danger',  duration: 3000 })
  prevGood.value = data.lastReadGood
  prevBad.value  = data.lastReadBad
})

const showBatchModal = ref(false)
const keypadValue    = ref('0')

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
    toast({ message: 'Value must be a valid 32-bit integer', color: 'danger' }); return
  }
  try {
    const res = await fetch('/api/plc/mes-batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: num }),
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
.dash-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }

/* KPI cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 768px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
.kpi-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 20px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}
.kpi-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--kpi-color, var(--va-primary));
}
.kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.kpi-icon { font-size: 1.3rem; opacity: 0.3; position: absolute; right: 14px; top: 14px; }
.kpi-value { font-size: 2rem; font-weight: 800; color: var(--kpi-color, var(--va-primary)); letter-spacing: -1px; line-height: 1.1; margin-bottom: 4px; }
.kpi-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }

/* Read row */
.read-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.read-card {
  display: flex; align-items: center; gap: 12px;
  flex: 1; min-width: 160px;
  padding: 16px; border-radius: 12px;
  border: 1px solid transparent;
  transition: all 0.3s;
}
.read-good { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); }
.read-bad  { background: rgba(239,68,68,0.1);  border-color: rgba(239,68,68,0.3); }
.read-inactive { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.07); }
.read-led { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; }
.led-green { background: #10b981; box-shadow: 0 0 12px rgba(16,185,129,0.8); animation: pulse-led 1.5s infinite; }
.led-red   { background: #ef4444; box-shadow: 0 0 12px rgba(239,68,68,0.8); animation: pulse-led 1s infinite; }
.led-off   { background: #374151; }
.read-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; font-weight: 600; }
.read-sub { font-size: 0.9rem; font-weight: 700; margin-top: 2px; }
.vision-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 20px;
  font-size: 0.8rem; font-weight: 600;
  border: 1px solid;
}
.vision-on  { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); color: #10b981; }
.vision-off { background: rgba(107,114,128,0.1); border-color: rgba(107,114,128,0.3); color: #6b7280; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.quality-header { display: flex; justify-content: space-between; align-items: baseline; }
.quality-pct { font-size: 1.5rem; font-weight: 800; }
.quality-footer { display: flex; gap: 20px; }

/* Two-col layout */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

.info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.info-row:last-child { border-bottom: none; }

.camera-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }

/* status badge */
.status-badge { display: flex; align-items: center; gap: 6px; border-radius: 20px; font-weight: 600; }
.status-ok  { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
.status-err { background: rgba(239,68,68,0.15);  color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

/* Keypad */
.keypad-display {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 14px 18px;
  font-size: 2rem; font-weight: 700; text-align: right;
  font-family: monospace; min-height: 64px;
}
.keypad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

@keyframes pulse-led {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>

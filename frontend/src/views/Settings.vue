<template>
  <div style="max-width:720px">
    <h2 class="va-h4 mb-1">Settings</h2>
    <p class="va-text-secondary mb-6">Configure PLC connection and camera stream parameters.</p>

    <!-- PLC settings -->
    <VaCard class="mb-4">
      <VaCardTitle>PLC Connection (Siemens S7-1200)</VaCardTitle>
      <VaCardContent>
        <VaInput v-model="form.plcIp" label="PLC IP Address" placeholder="192.168.1.10" class="mb-3" />
        <div class="grid gap-3 mb-3" style="grid-template-columns:1fr 1fr">
          <VaInput v-model.number="form.plcRack" label="Rack" type="number" placeholder="0" />
          <VaInput v-model.number="form.plcSlot" label="Slot" type="number" placeholder="1" />
        </div>
        <VaInput v-model.number="form.pollIntervalMs" label="Poll Interval (ms)" type="number" placeholder="1000" />
      </VaCardContent>
    </VaCard>

    <!-- Camera settings -->
    <VaCard class="mb-4">
      <VaCardTitle>Camera Stream (Zebra FS42)</VaCardTitle>
      <VaCardContent>
        <VaInput v-model="form.cameraIp" label="Camera IP Address" placeholder="192.168.1.73" class="mb-3" />
        <VaInput v-model="form.cameraUrl" label="Camera URL" placeholder="http://192.168.1.73/" />
      </VaCardContent>
    </VaCard>

    <!-- System Enable -->
    <VaCard class="mb-4">
      <VaCardTitle>System Controls</VaCardTitle>
      <VaCardContent>
        <div class="flex items-center justify-between">
          <div>
            <div class="font-bold mb-1">System Enable</div>
            <div class="va-text-secondary text-sm">Controls PLC address M14.0</div>
          </div>
          <VaSwitch v-model="systemEnable" @update:model-value="writeSystemEnable" />
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Trigger Offset -->
    <VaCard class="mb-4">
      <VaCardTitle>Trigger Offset</VaCardTitle>
      <VaCardContent>
        <div class="flex justify-between mb-2">
          <span class="font-bold">Trigger Offset (ms)</span>
          <VaBadge :text="triggerOffset + ' ms'" color="info" />
        </div>
        <VaSlider v-model="triggerOffset" :min="1" :max="2000" :step="1" track-label-visible />
        <div class="va-text-secondary text-sm mt-1">Delay between trigger signal and camera capture (PLC address %MW12)</div>
      </VaCardContent>
    </VaCard>

    <!-- Theme -->
    <VaCard class="mb-4">
      <VaCardTitle>Dashboard Theme</VaCardTitle>
      <VaCardContent>
        <VaSelect
          v-model="form.theme"
          label="Theme"
          :options="themeOptions"
          value-by="value"
          text-by="label"
        />
      </VaCardContent>
    </VaCard>

    <!-- Grid settings -->
    <VaCard class="mb-4">
      <VaCardTitle>Dashboard Grid</VaCardTitle>
      <VaCardContent>
        <div class="grid gap-3" style="grid-template-columns:1fr 1fr 1fr">
          <VaInput v-model.number="form.gridCols" label="Columns" type="number" placeholder="12" />
          <VaInput v-model.number="form.gridCellHeight" label="Row Height (px)" type="number" placeholder="80" />
          <VaInput v-model.number="form.gridGap" label="Gap (px)" type="number" placeholder="12" />
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Backup & Restore -->
    <VaCard class="mb-4">
      <VaCardTitle>Backup &amp; Restore</VaCardTitle>
      <VaCardContent>
        <p class="va-text-secondary text-sm mb-4">Export the full dashboard configuration to a JSON file. Import later to restore.</p>
        <div class="flex gap-2 flex-wrap">
          <VaButton preset="secondary" @click="exportConfig" icon="download">Export Config</VaButton>
          <VaButton preset="secondary" @click="triggerImport" icon="upload">Import Config</VaButton>
          <input ref="importFileRef" type="file" accept=".json,application/json" style="display:none" @change="importConfig" />
        </div>
        <p class="va-text-secondary text-sm mt-3">⚠️ Importing will <strong>replace</strong> all current settings, tags and widgets.</p>
      </VaCardContent>
    </VaCard>

    <!-- Actions -->
    <div class="flex gap-3 flex-wrap">
      <VaButton @click="saveSettings" icon="save">Save Settings</VaButton>
      <VaButton preset="secondary" @click="resetDefaults" icon="refresh">Reset to Defaults</VaButton>
      <VaButton preset="secondary" :to="'/'" icon="arrow_back">Back to Dashboard</VaButton>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'vuestic-ui'

const { init: initToast } = useToast()
const toast = initToast()

const DEFAULTS = {
  plcIp: '192.168.1.10', plcRack: 0, plcSlot: 1,
  cameraIp: '192.168.1.73', cameraUrl: 'http://192.168.1.73/',
  pollIntervalMs: 1000, theme: 'dark', gridCols: 12, gridCellHeight: 80, gridGap: 12,
}

const form = ref({ ...DEFAULTS })
const systemEnable = ref(true)
const triggerOffset = ref(500)
const importFileRef = ref(null)

const themeOptions = [
  { label: 'Dark (default)', value: 'dark' },
  { label: 'Light', value: 'light' },
  { label: 'Industrial', value: 'industrial' },
  { label: 'Ocean', value: 'ocean' },
]

async function loadSettings() {
  try {
    const res = await fetch('/api/settings')
    const data = await res.json()
    Object.assign(form.value, data)
  } catch (e) {
    toast({ message: 'Could not load settings: ' + e.message, color: 'danger' })
  }
}

async function loadSystemEnable() {
  try {
    const res = await fetch('/api/plc/system-enable')
    const json = await res.json()
    if (json.ok && json.value !== null) systemEnable.value = json.value
  } catch (_) {}
}

async function loadTriggerOffset() {
  try {
    const res = await fetch('/api/plc/trigger-offset')
    const json = await res.json()
    if (json.ok && json.value !== null) triggerOffset.value = Math.min(Math.max(json.value, 1), 2000)
  } catch (_) {}
}

async function saveSettings() {
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    const json = await res.json()
    if (json.ok) {
      toast({ message: 'Settings saved successfully', color: 'success' })
      await writeSystemEnable(systemEnable.value)
      await writeTriggerOffset(triggerOffset.value)
    } else {
      toast({ message: 'Save failed: ' + json.error, color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Save error: ' + e.message, color: 'danger' })
  }
}

async function writeSystemEnable(value) {
  try {
    await fetch('/api/plc/system-enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
  } catch (_) {}
}

async function writeTriggerOffset(value) {
  try {
    await fetch('/api/plc/trigger-offset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
  } catch (_) {}
}

function resetDefaults() {
  form.value = { ...DEFAULTS }
  systemEnable.value = true
  triggerOffset.value = 500
  toast({ message: 'Form reset to defaults (not saved yet)', color: 'info' })
}

function exportConfig() {
  const link = document.createElement('a')
  link.href = '/api/export'
  link.download = 'dashboard-config.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  toast({ message: 'Configuration download started', color: 'success' })
}

function triggerImport() {
  importFileRef.value?.click()
}

async function importConfig(e) {
  const file = e.target.files?.[0]
  if (!file) return
  let bundle
  try { bundle = JSON.parse(await file.text()) } catch (_) { toast({ message: 'Invalid JSON file', color: 'danger' }); return }
  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    })
    const json = await res.json()
    if (json.ok) {
      toast({ message: 'Configuration imported — reloading…', color: 'success' })
      setTimeout(() => location.reload(), 1500)
    } else {
      const detail = json.errors ? json.errors.join('; ') : (json.error || 'Unknown error')
      toast({ message: 'Import failed: ' + detail, color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Import error: ' + e.message, color: 'danger' })
  }
  if (importFileRef.value) importFileRef.value.value = ''
}

onMounted(() => { loadSettings(); loadSystemEnable(); loadTriggerOffset() })
</script>

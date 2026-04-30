<template>
  <div>
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2 class="va-h4">Widget Dashboard</h2>
        <p class="va-text-secondary text-sm">Configurable widgets linked to PLC tags.</p>
      </div>
      <div class="flex gap-2">
        <VaButton preset="secondary" @click="loadWidgets" icon="refresh" size="small">Refresh</VaButton>
        <template v-if="!editMode">
          <VaButton @click="editMode = true" icon="edit" size="small">Edit Layout</VaButton>
        </template>
        <template v-else>
          <VaButton @click="openAddWidgetModal" icon="add" size="small">Add Widget</VaButton>
          <VaButton preset="secondary" @click="editMode = false" icon="check" size="small">Done</VaButton>
        </template>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="widgets.length === 0" class="empty-state">
      <VaIcon name="grid_view" size="56px" color="secondary" />
      <p class="va-h6 mt-3 mb-1">No widgets yet</p>
      <p class="va-text-secondary text-sm">Click <strong>Edit Layout → Add Widget</strong> to get started.</p>
    </div>

    <!-- Widget grid -->
    <div v-else class="widget-grid">
      <VaCard
        v-for="widget in widgets"
        :key="widget.id"
        class="widget-card"
        :style="widgetStyle(widget)"
      >
        <VaCardTitle class="widget-title">
          <VaIcon :name="typeIcon(widget.type)" size="16px" style="opacity:0.6; margin-right:6px" />
          {{ widget.label }}
          <div v-if="editMode" class="flex gap-1 ml-auto">
            <VaButton size="small" preset="plain" icon="edit" @click="openEditWidgetModal(widget)" />
            <VaButton size="small" preset="plain" icon="delete" color="danger" @click="deleteWidget(widget)" />
          </div>
        </VaCardTitle>
        <VaCardContent class="widget-content">
          <component :is="widgetComponent(widget)" :widget="widget" :plc-data="plcData" />
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Add/Edit Widget Modal -->
    <VaModal v-model="showWidgetModal" :title="editingWidget ? 'Edit Widget' : 'Add Widget'" hide-default-actions size="medium">
      <div class="modal-body">
        <!-- Basic info -->
        <div class="form-section">
          <VaInput v-model="widgetForm.label" label="Widget Title" class="mb-3" />
          <VaSelect v-model="widgetForm.type" label="Widget Type" :options="widgetTypes" value-by="value" text-by="label" class="mb-3" />
        </div>

        <!-- Single tag selector -->
        <div v-if="isSingleTagType" class="form-section">
          <VaSelect v-model="widgetForm.tagName" label="PLC Tag" :options="tagOptions" value-by="value" text-by="label" clearable class="mb-3" />
        </div>

        <!-- Multi-tag builder -->
        <div v-if="isMultiTagType" class="form-section">
          <div class="flex items-center justify-between mb-2">
            <label class="va-text-secondary text-sm font-bold uppercase tracking-widest">Tags</label>
            <VaButton size="small" preset="plain" icon="add" @click="addTagRow">Add Tag</VaButton>
          </div>
          <div v-for="(row, i) in widgetForm.tags" :key="i" class="tag-row mb-2">
            <VaSelect v-model="row.tagName" :options="tagOptions" value-by="value" text-by="label" placeholder="Tag" style="flex:1" />
            <VaInput v-model="row.label" placeholder="Label" style="flex:1" />
            <VaInput v-model="row.color" placeholder="#hex" style="width:90px" />
            <VaButton size="small" preset="plain" icon="delete" color="danger" @click="removeTagRow(i)" />
          </div>
        </div>

        <!-- Scatter tag selectors -->
        <div v-if="widgetForm.type === 'scatter'" class="form-section">
          <div class="grid gap-3 mb-3" style="grid-template-columns:1fr 1fr">
            <VaSelect v-model="widgetForm.config.xTag" label="X Axis Tag" :options="tagOptions" value-by="value" text-by="label" clearable />
            <VaSelect v-model="widgetForm.config.yTag" label="Y Axis Tag" :options="tagOptions" value-by="value" text-by="label" clearable />
          </div>
        </div>

        <!-- Unit -->
        <div v-if="hasUnit" class="form-section">
          <VaInput v-model="widgetForm.config.unit" label="Unit (optional)" placeholder="e.g. ms, %, bags" class="mb-3" />
        </div>

        <!-- Min/Max for gauge -->
        <div v-if="widgetForm.type === 'gauge' || widgetForm.type === 'progress'" class="form-section">
          <div class="grid gap-3 mb-3" style="grid-template-columns:1fr 1fr">
            <VaInput v-model.number="widgetForm.config.min" label="Min" type="number" />
            <VaInput v-model.number="widgetForm.config.max" label="Max" type="number" />
          </div>
        </div>

        <!-- History length for line/scatter -->
        <div v-if="widgetForm.type === 'line' || widgetForm.type === 'scatter'" class="form-section">
          <VaInput v-model.number="widgetForm.config.historyLength" label="History Length" type="number" placeholder="30" class="mb-3" />
        </div>

        <!-- Horizontal option for bar -->
        <div v-if="widgetForm.type === 'bar'" class="form-section mb-3">
          <VaSwitch v-model="widgetForm.config.horizontal" label="Horizontal bars" />
        </div>

        <!-- Width & Height -->
        <div class="grid gap-3 mb-3" style="grid-template-columns:1fr 1fr">
          <VaInput v-model.number="widgetForm.w" label="Width (cols 1-12)" type="number" :min="1" :max="12" />
          <VaInput v-model.number="widgetForm.h" label="Height (rows 1-4)" type="number" :min="1" :max="4" />
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <VaButton preset="secondary" @click="showWidgetModal = false">Cancel</VaButton>
          <VaButton @click="saveWidget" icon="save">Save Widget</VaButton>
        </div>
      </template>
    </VaModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vuestic-ui'
import { useSocket } from '@/composables/useSocket'

import ValueWidget    from '@/components/widgets/ValueWidget.vue'
import GaugeWidget    from '@/components/widgets/GaugeWidget.vue'
import ProgressWidget from '@/components/widgets/ProgressWidget.vue'
import BooleanWidget  from '@/components/widgets/BooleanWidget.vue'
import LineChartWidget  from '@/components/widgets/LineChartWidget.vue'
import BarChartWidget   from '@/components/widgets/BarChartWidget.vue'
import PieWidget        from '@/components/widgets/PieWidget.vue'
import DoughnutWidget   from '@/components/widgets/DoughnutWidget.vue'
import RadarWidget      from '@/components/widgets/RadarWidget.vue'
import ScatterWidget    from '@/components/widgets/ScatterWidget.vue'

const { init: initToast } = useToast()
const toast = initToast()
const { state } = useSocket()

const plcData = computed(() => state.data)
const widgets = ref([])
const editMode = ref(false)
const showWidgetModal = ref(false)
const editingWidget = ref(null)
const tags = ref([])

const tagOptions = computed(() => [
  { label: '— None —', value: '' },
  ...tags.value.map(t => ({ label: t.name, value: t.name }))
])

const widgetTypes = [
  { label: 'Value Display',     value: 'value' },
  { label: 'Gauge',             value: 'gauge' },
  { label: 'Progress Bar',      value: 'progress' },
  { label: 'Boolean Indicator', value: 'boolean' },
  { label: 'Line Chart',        value: 'line' },
  { label: 'Bar Chart',         value: 'bar' },
  { label: 'Pie Chart',         value: 'pie' },
  { label: 'Doughnut Chart',    value: 'doughnut' },
  { label: 'Radar Chart',       value: 'radar' },
  { label: 'Scatter Plot',      value: 'scatter' },
]

const SINGLE_TAG_TYPES = ['value', 'gauge', 'progress', 'boolean', 'line']
const MULTI_TAG_TYPES  = ['bar', 'pie', 'doughnut', 'radar']

const isSingleTagType = computed(() => SINGLE_TAG_TYPES.includes(widgetForm.value.type))
const isMultiTagType  = computed(() => MULTI_TAG_TYPES.includes(widgetForm.value.type))
const hasUnit = computed(() => ['value', 'gauge', 'progress', 'line'].includes(widgetForm.value.type))

const EMPTY_FORM = () => ({
  label: '',
  type: 'value',
  tagName: '',
  tags: [],
  config: { unit: '', min: 0, max: 100, historyLength: 30, horizontal: false, xTag: '', yTag: '' },
  w: 4,
  h: 2,
})
const widgetForm = ref(EMPTY_FORM())

function widgetComponent(w) {
  const map = {
    value: ValueWidget, gauge: GaugeWidget, progress: ProgressWidget, boolean: BooleanWidget,
    line: LineChartWidget, bar: BarChartWidget, pie: PieWidget,
    doughnut: DoughnutWidget, radar: RadarWidget, scatter: ScatterWidget,
  }
  return map[w.type] ?? ValueWidget
}

function typeIcon(type) {
  const icons = {
    value: 'numbers', gauge: 'speed', progress: 'linear_scale', boolean: 'toggle_on',
    line: 'show_chart', bar: 'bar_chart', pie: 'pie_chart',
    doughnut: 'donut_large', radar: 'radar', scatter: 'scatter_plot',
  }
  return icons[type] ?? 'widgets'
}

function widgetStyle(w) {
  return {
    'grid-column': `span ${w.w || 4}`,
    'grid-row': `span ${w.h || 2}`,
  }
}

function addTagRow() {
  widgetForm.value.tags.push({ tagName: '', label: '', color: '' })
}

function removeTagRow(i) {
  widgetForm.value.tags.splice(i, 1)
}

async function loadWidgets() {
  try {
    const [wRes, tRes] = await Promise.all([fetch('/api/widgets'), fetch('/api/tags')])
    const wJson = await wRes.json()
    const tJson = await tRes.json()
    widgets.value = (wJson.widgets || []).map(w => ({ ...w }))
    tags.value = tJson.tags || []
  } catch (e) {
    toast({ message: 'Could not load widgets: ' + e.message, color: 'danger' })
  }
}

function openAddWidgetModal() {
  editingWidget.value = null
  widgetForm.value = EMPTY_FORM()
  showWidgetModal.value = true
}

function openEditWidgetModal(w) {
  editingWidget.value = w
  widgetForm.value = {
    label: w.label,
    type: w.type,
    tagName: w.tagName || '',
    tags: (w.tags || []).map(t => ({ ...t })),
    config: {
      unit: w.config?.unit || '',
      min: w.config?.min ?? 0,
      max: w.config?.max ?? 100,
      historyLength: w.config?.historyLength ?? 30,
      horizontal: w.config?.horizontal ?? false,
      xTag: w.config?.xTag || '',
      yTag: w.config?.yTag || '',
    },
    w: w.w || 4,
    h: w.h || 2,
  }
  showWidgetModal.value = true
}

async function saveWidget() {
  if (!widgetForm.value.label) { toast({ message: 'Title is required', color: 'warning' }); return }
  const f = widgetForm.value
  const payload = {
    label: f.label,
    type: f.type,
    tagName: f.tagName || undefined,
    tags: f.tags.filter(t => t.tagName),
    config: { ...f.config },
    w: f.w || 4,
    h: f.h || 2,
  }
  try {
    let res
    if (editingWidget.value) {
      payload.id = editingWidget.value.id
      res = await fetch(`/api/widgets/${editingWidget.value.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
    } else {
      payload.id = 'widget-' + Date.now()
      res = await fetch('/api/widgets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
    }
    const json = await res.json()
    if (json.ok) {
      toast({ message: editingWidget.value ? 'Widget updated' : 'Widget added', color: 'success' })
      showWidgetModal.value = false
      await loadWidgets()
    } else {
      toast({ message: json.error || 'Save failed', color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Save error: ' + e.message, color: 'danger' })
  }
}

async function deleteWidget(w) {
  try {
    const res = await fetch(`/api/widgets/${w.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.ok) { toast({ message: 'Widget deleted', color: 'success' }); await loadWidgets() }
    else toast({ message: json.error || 'Delete failed', color: 'danger' })
  } catch (e) {
    toast({ message: 'Delete error: ' + e.message, color: 'danger' })
  }
}

onMounted(loadWidgets)
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  text-align: center;
  background: rgba(255,255,255,0.02);
  border: 2px dashed rgba(255,255,255,0.1);
  border-radius: 16px;
}
.widget-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
  align-items: start;
}
.widget-card { overflow: hidden; }
.widget-title { display: flex; align-items: center; font-size: 0.85rem; padding: 10px 14px 0; }
.widget-content { padding: 10px 14px 14px; }
.modal-body { max-height: 70vh; overflow-y: auto; padding: 4px 0; }
.form-section { margin-bottom: 4px; }
.tag-row { display: flex; gap: 8px; align-items: center; }
</style>

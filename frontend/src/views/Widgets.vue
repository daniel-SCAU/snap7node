<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="va-h4">Widget Dashboard</h2>
        <p class="va-text-secondary">Configurable widgets linked to PLC tags.</p>
      </div>
      <div class="flex gap-2">
        <VaButton preset="secondary" @click="loadWidgets" icon="refresh">Refresh</VaButton>
        <VaButton v-if="!editMode" @click="editMode = true" icon="edit">Edit Layout</VaButton>
        <VaButton v-if="editMode" @click="openAddWidgetModal" icon="add">Add Widget</VaButton>
        <VaButton v-if="editMode" preset="secondary" @click="editMode = false" icon="check">Done</VaButton>
      </div>
    </div>

    <div v-if="widgets.length === 0" class="flex flex-col items-center justify-center" style="min-height:200px">
      <VaIcon name="grid_view" size="48px" color="secondary" class="mb-3" />
      <p class="va-text-secondary">No widgets defined. Click <strong>Edit Layout → Add Widget</strong> to get started.</p>
    </div>

    <div class="widget-grid" v-else>
      <VaCard
        v-for="widget in widgets"
        :key="widget.id"
        class="widget-card"
        :style="widgetStyle(widget)"
      >
        <VaCardTitle class="widget-card-title">
          {{ widget.label }}
          <div v-if="editMode" class="flex gap-1 ml-auto">
            <VaButton size="small" preset="plain" icon="edit" @click="openEditWidgetModal(widget)" />
            <VaButton size="small" preset="plain" icon="delete" color="danger" @click="deleteWidget(widget)" />
          </div>
        </VaCardTitle>
        <VaCardContent>
          <component :is="widgetComponent(widget)" :widget="widget" :plc-data="plcData" />
        </VaCardContent>
      </VaCard>
    </div>

    <!-- Add/Edit Widget Modal -->
    <VaModal v-model="showWidgetModal" :title="editingWidget ? 'Edit Widget' : 'Add Widget'" hide-default-actions>
      <div class="flex flex-col gap-3 mb-4">
        <VaInput v-model="widgetForm.label" label="Widget Title" />
        <VaSelect v-model="widgetForm.type" label="Widget Type" :options="widgetTypes" value-by="value" text-by="label" />
        <VaSelect v-model="widgetForm.tagName" label="PLC Tag" :options="tagOptions" value-by="value" text-by="label" clearable />
        <VaInput v-model="widgetForm.unit" label="Unit (optional)" placeholder="e.g. ms, %, bags" />
      </div>
      <div class="flex gap-2 justify-end">
        <VaButton preset="secondary" @click="showWidgetModal = false">Cancel</VaButton>
        <VaButton @click="saveWidget" icon="save">Save Widget</VaButton>
      </div>
    </VaModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vuestic-ui'
import { useSocket } from '@/composables/useSocket'
import ValueWidget from '@/components/widgets/ValueWidget.vue'
import GaugeWidget from '@/components/widgets/GaugeWidget.vue'
import BarWidget from '@/components/widgets/BarWidget.vue'

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
  { label: 'Value Display', value: 'value' },
  { label: 'Progress Bar',  value: 'bargraph' },
  { label: 'Gauge',         value: 'gauge' },
]

const EMPTY_WIDGET_FORM = () => ({ label: '', type: 'value', tagName: '', unit: '' })
const widgetForm = ref(EMPTY_WIDGET_FORM())

function widgetComponent(w) {
  if (w.type === 'bargraph') return BarWidget
  if (w.type === 'gauge') return GaugeWidget
  return ValueWidget
}

function widgetStyle(w) {
  return { '--widget-cols': w.w || 3, '--widget-rows': w.h || 2 }
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
  widgetForm.value = EMPTY_WIDGET_FORM()
  showWidgetModal.value = true
}

function openEditWidgetModal(w) {
  editingWidget.value = w
  widgetForm.value = { label: w.label, type: w.type, tagName: w.tagName || '', unit: w.config?.unit || '' }
  showWidgetModal.value = true
}

async function saveWidget() {
  if (!widgetForm.value.label) { toast({ message: 'Title is required', color: 'warning' }); return }
  try {
    let res
    if (editingWidget.value) {
      const payload = {
        id: editingWidget.value.id,
        label: widgetForm.value.label,
        type: widgetForm.value.type,
        tagName: widgetForm.value.tagName || undefined,
        w: editingWidget.value.w || 3,
        h: editingWidget.value.h || 2,
        config: { unit: widgetForm.value.unit },
      }
      res = await fetch(`/api/widgets/${editingWidget.value.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
    } else {
      const id = 'widget-' + Date.now()
      const payload = {
        id,
        label: widgetForm.value.label,
        type: widgetForm.value.type,
        tagName: widgetForm.value.tagName || undefined,
        w: 3,
        h: 2,
        config: { unit: widgetForm.value.unit },
      }
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
.widget-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
.widget-card {
  grid-column: span var(--widget-cols, 3);
  grid-row: span var(--widget-rows, 2);
}
.widget-card-title { display: flex; align-items: center; }
</style>

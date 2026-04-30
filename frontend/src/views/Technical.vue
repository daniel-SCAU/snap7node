<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="va-h4">Technical Tag Manager</h2>
        <p class="va-text-secondary">Create, read and write PLC tags on the Siemens S7-1200.</p>
      </div>
      <VaButton @click="openAddModal" icon="add">Add Tag</VaButton>
    </div>

    <VaCard class="mb-4">
      <VaCardTitle>Defined Tags</VaCardTitle>
      <VaCardContent style="padding:0">
        <VaDataTable
          :items="tags"
          :columns="columns"
          :loading="loading"
          class="tag-table"
        >
          <template #cell(value)="{ rowData }">
            <span :class="rowData.value != null ? 'font-mono' : 'va-text-secondary'">
              {{ rowData.value != null ? String(rowData.value) : '—' }}
            </span>
          </template>
          <template #cell(writeValue)="{ rowData }">
            <VaInput
              v-model="rowData._writeVal"
              size="small"
              placeholder="Value"
              style="max-width:120px"
            />
          </template>
          <template #cell(actions)="{ rowData }">
            <div class="flex gap-1">
              <VaButton size="small" preset="plain" icon="play_arrow" @click="writeTag(rowData)" title="Write" />
              <VaButton size="small" preset="plain" icon="refresh" @click="readTag(rowData)" title="Read" />
              <VaButton size="small" preset="plain" icon="edit" @click="openEditModal(rowData)" title="Edit" />
              <VaButton size="small" preset="plain" icon="delete" color="danger" @click="openDeleteModal(rowData)" title="Delete" />
            </div>
          </template>
        </VaDataTable>
      </VaCardContent>
    </VaCard>

    <VaButton preset="secondary" @click="readAllTags" icon="refresh">Read All Tags</VaButton>

    <!-- Add / Edit Tag Modal -->
    <VaModal v-model="showTagModal" :title="editingTag ? 'Edit Tag' : 'Add Tag'" hide-default-actions>
      <div class="grid gap-3 mb-3" style="grid-template-columns:1fr 1fr">
        <VaInput v-model="tagForm.name" label="Tag Name" placeholder="e.g. myTag" />
        <VaSelect v-model="tagForm.datatype" label="Data Type" :options="datatypeOptions" value-by="value" text-by="label" />
      </div>
      <div class="grid gap-3 mb-3" style="grid-template-columns:1fr 1fr">
        <VaSelect v-model="tagForm.area" label="Memory Area" :options="areaOptions" value-by="value" text-by="label" @update:model-value="onAreaChange" />
        <VaInput v-if="tagForm.area === 'DB'" v-model.number="tagForm.dbNumber" label="DB Number" type="number" placeholder="e.g. 1" />
      </div>
      <div class="grid gap-3 mb-3" style="grid-template-columns:1fr 1fr">
        <VaInput v-model.number="tagForm.byteOffset" label="Byte Offset" type="number" placeholder="e.g. 12" />
        <VaSelect v-if="tagForm.datatype === 'Bool'" v-model.number="tagForm.bitOffset" label="Bit Offset" :options="[0,1,2,3,4,5,6,7]" />
      </div>
      <div class="flex gap-2 justify-end">
        <VaButton preset="secondary" @click="showTagModal = false">Cancel</VaButton>
        <VaButton @click="saveTag" icon="save">Save Tag</VaButton>
      </div>
    </VaModal>

    <!-- Delete confirm modal -->
    <VaModal v-model="showDeleteModal" title="Delete Tag" hide-default-actions>
      <p>Are you sure you want to delete tag <strong>{{ deletingTag?.name }}</strong>? This action cannot be undone.</p>
      <div class="flex gap-2 justify-end mt-4">
        <VaButton preset="secondary" @click="showDeleteModal = false">Cancel</VaButton>
        <VaButton color="danger" @click="confirmDelete">Delete</VaButton>
      </div>
    </VaModal>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from 'vuestic-ui'
import { useSocket } from '@/composables/useSocket'

const { init: initToast } = useToast()
const toast = initToast()
const { socket } = useSocket()

const tags = ref([])
const loading = ref(false)

const columns = [
  { key: 'name',       label: 'Name' },
  { key: 'area',       label: 'Area' },
  { key: 'address',    label: 'Address' },
  { key: 'datatype',   label: 'Type' },
  { key: 'value',      label: 'Current Value' },
  { key: 'writeValue', label: 'Write Value' },
  { key: 'actions',    label: 'Actions' },
]

const datatypeOptions = [
  { label: 'Bool (bit)',          value: 'Bool' },
  { label: 'Byte (8-bit)',        value: 'Byte' },
  { label: 'Word (16-bit unsigned)', value: 'Word' },
  { label: 'Int (16-bit signed)', value: 'Int' },
  { label: 'DWord (32-bit unsigned)', value: 'DWord' },
  { label: 'DInt (32-bit signed)',value: 'DInt' },
  { label: 'Real (32-bit float)', value: 'Real' },
]

const areaOptions = [
  { label: 'MK — Merker (Flags)', value: 'MK' },
  { label: 'DB — Data Block',     value: 'DB' },
]

const showTagModal   = ref(false)
const showDeleteModal = ref(false)
const editingTag     = ref(null)
const deletingTag    = ref(null)

const EMPTY_FORM = () => ({ name: '', datatype: 'Int', area: 'MK', dbNumber: 1, byteOffset: 0, bitOffset: 0 })
const tagForm = ref(EMPTY_FORM())

function addressFor(tag) {
  if (tag.area === 'DB') return `DB${tag.dbNumber}.DBB${tag.byteOffset}` + (tag.datatype === 'Bool' ? `.${tag.bitOffset}` : '')
  return `M${tag.byteOffset}` + (tag.datatype === 'Bool' ? `.${tag.bitOffset}` : '')
}

async function loadTags() {
  loading.value = true
  try {
    const res = await fetch('/api/tags')
    const json = await res.json()
    tags.value = (json.tags || []).map(t => ({ ...t, address: addressFor(t), value: null, _writeVal: '' }))
  } catch (e) {
    toast({ message: 'Could not load tags: ' + e.message, color: 'danger' })
  } finally {
    loading.value = false
  }
}

async function saveTag() {
  const payload = { ...tagForm.value }
  try {
    let res
    if (editingTag.value) {
      res = await fetch(`/api/tags/${editingTag.value.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    const json = await res.json()
    if (json.ok) {
      toast({ message: editingTag.value ? 'Tag updated' : 'Tag added', color: 'success' })
      showTagModal.value = false
      await loadTags()
    } else {
      toast({ message: json.error || 'Save failed', color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Save error: ' + e.message, color: 'danger' })
  }
}

async function confirmDelete() {
  try {
    const res = await fetch(`/api/tags/${deletingTag.value.name}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.ok) {
      toast({ message: 'Tag deleted', color: 'success' })
      showDeleteModal.value = false
      await loadTags()
    } else {
      toast({ message: json.error || 'Delete failed', color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Delete error: ' + e.message, color: 'danger' })
  }
}

async function readTag(tag) {
  try {
    const res = await fetch(`/api/tags/${tag.name}/read`)
    const json = await res.json()
    if (json.ok) {
      tag.value = json.value
    } else {
      toast({ message: json.error || 'Read failed', color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Read error: ' + e.message, color: 'danger' })
  }
}

async function writeTag(tag) {
  const raw = tag._writeVal
  if (raw === '' || raw == null) { toast({ message: 'Enter a value to write', color: 'warning' }); return }
  let value
  if (tag.datatype === 'Bool') value = (raw === 'true' || raw === '1')
  else if (tag.datatype === 'Real') value = parseFloat(raw)
  else value = parseInt(raw, 10)

  try {
    const res = await fetch(`/api/tags/${tag.name}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    const json = await res.json()
    if (json.ok) {
      toast({ message: 'Tag written successfully', color: 'success' })
      await readTag(tag)
    } else {
      toast({ message: json.error || 'Write failed', color: 'danger' })
    }
  } catch (e) {
    toast({ message: 'Write error: ' + e.message, color: 'danger' })
  }
}

async function readAllTags() {
  for (const tag of tags.value) await readTag(tag)
  toast({ message: 'All tags read', color: 'success' })
}

function openAddModal() {
  editingTag.value = null
  tagForm.value = EMPTY_FORM()
  showTagModal.value = true
}

function openEditModal(tag) {
  editingTag.value = tag
  tagForm.value = { name: tag.name, datatype: tag.datatype, area: tag.area, dbNumber: tag.dbNumber || 1, byteOffset: tag.byteOffset || 0, bitOffset: tag.bitOffset || 0 }
  showTagModal.value = true
}

function openDeleteModal(tag) {
  deletingTag.value = tag
  showDeleteModal.value = true
}

function onAreaChange(val) {
  if (val !== 'DB') tagForm.value.dbNumber = 1
}

function onTagValues(values) {
  for (const tag of tags.value) {
    if (tag.name in values) tag.value = values[tag.name]
  }
}

onMounted(() => { loadTags(); socket.on('tagValues', onTagValues) })
onUnmounted(() => { socket.off('tagValues', onTagValues) })
</script>

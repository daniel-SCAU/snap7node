<template>
  <VaLayout
    :top="{ fixed: true, order: 1 }"
    :left="{ fixed: true, absolute: $vaBreakpoint.smDown, overlay: $vaBreakpoint.smDown }"
  >
    <template #top>
      <VaNavbar color="backgroundSecondary" class="py-2">
        <template #left>
          <VaButton
            v-if="$vaBreakpoint.smDown"
            preset="plain"
            icon="menu"
            @click="isSidebarVisible = !isSidebarVisible"
          />
          <span class="va-h6 ml-2">Vision Dashboard</span>
        </template>
        <template #right>
          <div class="flex items-center gap-3 mr-3">
            <VaBadge
              :color="plcStatus.connected ? 'success' : 'danger'"
              :text="plcStatus.connected ? 'PLC Connected' : 'PLC Disconnected'"
              class="px-2"
            />
            <span v-if="lastUpdate" class="text-sm text-secondary">
              {{ lastUpdate.toLocaleTimeString() }}
            </span>
          </div>
        </template>
      </VaNavbar>
    </template>

    <template #left>
      <VaSidebar v-model="isSidebarVisible" minimized-on-hover>
        <VaSidebarItem
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :active="$route.path === item.path"
        >
          <VaSidebarItemContent>
            <VaIcon :name="item.icon" />
            <VaSidebarItemTitle>{{ item.label }}</VaSidebarItemTitle>
          </VaSidebarItemContent>
        </VaSidebarItem>
      </VaSidebar>
    </template>

    <template #content>
      <main class="app-layout__page">
        <RouterView />
      </main>
    </template>
  </VaLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSocket } from '@/composables/useSocket'

const { state } = useSocket()
const $route = useRoute()
const isSidebarVisible = ref(true)

const plcStatus = computed(() => ({
  connected: state.plcConnected,
  error: state.plcError,
}))

const lastUpdate = computed(() => state.lastUpdate)

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/widgets', label: 'Widgets', icon: 'grid_view' },
  { path: '/technical', label: 'Technical', icon: 'code' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
]
</script>

<style>
body { margin: 0; font-family: 'Inter', sans-serif; }
.app-layout__page { padding: 24px; min-height: calc(100vh - 64px); }
</style>

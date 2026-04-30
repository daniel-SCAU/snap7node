<template>
  <VaLayout
    :top="{ fixed: true, order: 1 }"
    :left="{ fixed: true, absolute: $vaBreakpoint.smDown, overlay: $vaBreakpoint.smDown }"
  >
    <template #top>
      <VaNavbar color="backgroundSecondary" class="app-navbar">
        <template #left>
          <VaButton
            v-if="$vaBreakpoint.smDown"
            preset="plain"
            icon="menu"
            @click="isSidebarVisible = !isSidebarVisible"
          />
          <div class="nav-logo">
            <VaIcon name="visibility" color="primary" size="22px" />
            <span class="nav-title">Vision Dashboard</span>
          </div>
        </template>
        <template #right>
          <div class="nav-right">
            <div class="status-badge" :class="plcStatus.connected ? 'status-ok' : 'status-err'">
              <span class="status-dot" />
              {{ plcStatus.connected ? 'PLC Connected' : 'PLC Disconnected' }}
            </div>
            <span v-if="lastUpdate" class="update-time">
              {{ lastUpdate.toLocaleTimeString() }}
            </span>
          </div>
        </template>
      </VaNavbar>
    </template>

    <template #left>
      <VaSidebar v-model="isSidebarVisible" minimized-on-hover class="app-sidebar">
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
      <main class="app-main">
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

const plcStatus = computed(() => ({ connected: state.plcConnected, error: state.plcError }))
const lastUpdate = computed(() => state.lastUpdate)

const navItems = [
  { path: '/',          label: 'Dashboard', icon: 'dashboard' },
  { path: '/widgets',   label: 'Widgets',   icon: 'grid_view' },
  { path: '/technical', label: 'Technical', icon: 'code' },
  { path: '/settings',  label: 'Settings',  icon: 'settings' },
]
</script>

<style>
body { margin: 0; font-family: 'Inter', sans-serif; }

.app-navbar { border-bottom: 1px solid rgba(255,255,255,0.07); }

.nav-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 4px;
}
.nav-title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.3px;
  background: linear-gradient(135deg, var(--va-primary) 0%, #06b6d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 16px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.status-ok  { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
.status-err { background: rgba(239,68,68,0.15);  color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-ok .status-dot { animation: blink 1.5s infinite; }

.update-time { font-size: 0.75rem; color: var(--va-text-secondary); font-family: monospace; }

.app-main { padding: 24px; min-height: calc(100vh - 64px); }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>

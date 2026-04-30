import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import Settings from '@/views/Settings.vue'
import Technical from '@/views/Technical.vue'
import Widgets from '@/views/Widgets.vue'

const routes = [
  { path: '/', component: Dashboard },
  { path: '/settings', component: Settings },
  { path: '/technical', component: Technical },
  { path: '/widgets', component: Widgets },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})

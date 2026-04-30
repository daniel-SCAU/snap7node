import { reactive, readonly } from 'vue'
import { io } from 'socket.io-client'

const state = reactive({
  connected: false,
  plcConnected: false,
  plcError: null,
  data: null,
  lastUpdate: null,
})

const socket = io(window.location.origin)

socket.on('connect', () => { state.connected = true })
socket.on('disconnect', () => { state.connected = false; state.plcConnected = false })
socket.on('plcStatus', (status) => {
  state.plcConnected = status.connected
  state.plcError = status.error || null
})
socket.on('plcData', ({ status, data }) => {
  state.plcConnected = status.connected
  state.plcError = status.error || null
  state.data = data
  state.lastUpdate = new Date()
})

export function useSocket() {
  return { state: readonly(state), socket }
}

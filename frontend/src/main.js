import { createApp } from 'vue'
import { createVuestic } from 'vuestic-ui'
import 'vuestic-ui/styles/essential.css'
import 'vuestic-ui/styles/typography.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.use(createVuestic())
app.mount('#app')

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// ⬇️ 新增這兩行
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

createApp(App).mount('#app')

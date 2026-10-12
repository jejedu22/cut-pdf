import { createRouter, createWebHashHistory } from 'vue-router'
import PdfView from './views/PdfView.vue'
import ConvertView from './views/ConvertView.vue'

// Historique « hash » : fonctionne sur n'importe quel hébergement statique, sans règle de réécriture.
export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'pdf', component: PdfView },
    { path: '/convertir', name: 'convert', component: ConvertView }
  ]
})

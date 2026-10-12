<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { getPdfPage } from '../store'
import { enqueueRender } from '../lib/renderQueue'

const props = defineProps({
  source: { type: Object, required: true },
  num: { type: Number, required: true },
  rotation: { type: Number, default: 0 },   // rotation ajoutée à celle de la page
  scale: { type: Number, default: 0.25 }
})

const canvas = ref(null)
const ready = ref(false)
let token = 0
let dead = false

function render() {
  const t = ++token
  return enqueueRender(async () => {
    if (dead || t !== token) return
    try {
      const page = await getPdfPage(props.source, props.num)
      const vp = page.getViewport({ scale: props.scale, rotation: (page.rotate + props.rotation) % 360 })
      const off = document.createElement('canvas')
      off.width = Math.ceil(vp.width)
      off.height = Math.ceil(vp.height)
      await page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise
      if (dead || t !== token || !canvas.value) return
      const c = canvas.value
      c.width = off.width
      c.height = off.height
      c.getContext('2d').drawImage(off, 0, 0)
      ready.value = true
    } catch {
      // rendu annulé ou page illisible : la miniature reste vide
    }
  })
}

onMounted(render)
watch(() => [props.source, props.num, props.rotation, props.scale], render)
onBeforeUnmount(() => { dead = true })
</script>

<template>
  <canvas v-show="ready" ref="canvas" />
</template>

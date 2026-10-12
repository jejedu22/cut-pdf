<script setup>
import { ref } from 'vue'

const emit = defineEmits(['file'])
const input = ref(null)
const over = ref(false)

function onDrop(e) {
  over.value = false
  if (e.dataTransfer.files[0]) emit('file', e.dataTransfer.files[0])
}

function onChange() {
  const f = input.value.files[0]
  input.value.value = ''
  if (f) emit('file', f)
}

defineExpose({ open: () => input.value.click() })
</script>

<template>
  <label
    id="drop" class="drop" :class="{ over }" tabindex="0"
    @keydown.enter.space.prevent="input.click()"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent.stop="onDrop"
  >
    <input id="file" ref="input" type="file" accept="application/pdf" hidden @change="onChange">
    <strong>Déposez un PDF ici</strong> ou cliquez pour choisir un fichier
    <small>Vos fichiers restent dans votre navigateur : rien n'est envoyé sur un serveur.</small>
  </label>
</template>

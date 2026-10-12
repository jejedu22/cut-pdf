<script setup>
import { ref } from 'vue'

defineProps({
  accept: { type: String, default: 'application/pdf' },
  title: { type: String, default: 'Déposez un PDF ici' },
  hint: { type: String, default: "Vos fichiers restent dans votre navigateur : rien n'est envoyé sur un serveur." }
})
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
    <input id="file" ref="input" type="file" :accept="accept" hidden @change="onChange">
    <strong>{{ title }}</strong> ou cliquez pour choisir un fichier
    <small>{{ hint }}</small>
  </label>
</template>

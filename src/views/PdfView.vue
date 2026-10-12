<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  state, loaded, fileInfo, openFile, goTo, rotate, toggleCut, toggleDelete, setZoom, movePage
} from '../store'
import DropZone from '../components/DropZone.vue'
import ThumbSidebar from '../components/ThumbSidebar.vue'
import PageViewer from '../components/PageViewer.vue'
import SidePanel from '../components/SidePanel.vue'
import InsertDialog from '../components/InsertDialog.vue'

const dropZone = ref(null)

async function load(file) {
  try {
    await openFile(file)
  } catch (e) {
    alert(e.message)
  }
}

/* Déposer un PDF n'importe où dans la page l'ouvre */
const onDocDragOver = e => e.preventDefault()
const onDocDrop = e => {
  e.preventDefault()
  if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0])
}

/* Raccourcis clavier */
function onKey(e) {
  if (!loaded.value || state.incoming || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
  const k = e.key
  const n = state.pages.length
  if (e.altKey) {
    if (k === 'ArrowLeft' || k === 'ArrowUp') movePage(state.cur, state.cur - 1)
    else if (k === 'ArrowRight' || k === 'ArrowDown') movePage(state.cur, state.cur + 1)
    else return
    e.preventDefault()
    return
  }
  if (k === 'ArrowLeft' || k === 'PageUp') goTo(state.cur - 1)
  else if (k === 'ArrowRight' || k === 'PageDown') goTo(state.cur + 1)
  else if (k === 'Home') goTo(1)
  else if (k === 'End') goTo(n)
  else if (k === 'r') rotate(state.cur, 90)
  else if (k === 'R') rotate(state.cur, -90)
  else if (k === 'c' || k === 'C') toggleCut(state.cur)
  else if (k === 'Delete') toggleDelete(state.cur)
  else if (k === '+' || k === '=') setZoom(state.zoom * 1.25)
  else if (k === '-') setZoom(state.zoom / 1.25)
  else if (k === '0') setZoom(1)
  else return
  e.preventDefault()
}

onMounted(() => {
  document.addEventListener('dragover', onDocDragOver)
  document.addEventListener('drop', onDocDrop)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('dragover', onDocDragOver)
  document.removeEventListener('drop', onDocDrop)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="#header-slot">
    <template v-if="loaded">
      <span id="fileInfo" class="file">{{ fileInfo }}</span>
      <button id="reset" class="btn" type="button" @click="dropZone.open()">Ouvrir un autre PDF</button>
    </template>
  </Teleport>

  <DropZone v-show="!loaded" ref="dropZone" @file="load" />

  <div v-if="loaded" id="app">
    <ThumbSidebar />
    <PageViewer />
    <SidePanel />
  </div>

  <InsertDialog v-if="state.incoming" />
</template>

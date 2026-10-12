<script setup>
import { ref, watch, nextTick } from 'vue'
import { state, partOf, goTo, toggleCut, movePage } from '../store'
import PdfCanvas from './PdfCanvas.vue'

const side = ref(null)
const box = ref(null)
const dragFrom = ref(0)
// Emplacement visé pendant un glisser : `gap` pages restent avant lui ; `page`/`after` ou `cut` pour l'indicateur
const dropAt = ref(null)

const horizontal = () => getComputedStyle(box.value).display === 'flex'
const partClass = i => (partOf.value.has(i) ? partOf.value.get(i) % 6 : undefined)

function onDragStart(e) {
  const t = e.target.closest?.('.thumb')
  if (!t) return
  dragFrom.value = +t.dataset.page
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(dragFrom.value))
}

function onDragOver(e) {
  if (!dragFrom.value) return
  const t = e.target.closest('.thumb')
  const c = e.target.closest('.cut')
  if (!t && !c) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  if (t) {
    const r = t.getBoundingClientRect()
    const after = horizontal() ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2
    const p = +t.dataset.page
    dropAt.value = { gap: after ? p : p - 1, page: p, after }
  } else {
    dropAt.value = { gap: +c.dataset.after, cut: +c.dataset.after }
  }
}

function onDragLeave(e) {
  if (!box.value.contains(e.relatedTarget)) dropAt.value = null
}

function onDrop(e) {
  e.preventDefault()
  const g = dropAt.value?.gap
  const from = dragFrom.value
  dropAt.value = null
  dragFrom.value = 0
  if (g === undefined || !from) return
  movePage(from, g > from ? g : g + 1)
}

function onDragEnd() {
  dragFrom.value = 0
  dropAt.value = null
}

// Défilement automatique de la colonne pendant le glisser
function autoScroll(e) {
  if (!dragFrom.value) return
  const el = side.value
  const r = el.getBoundingClientRect()
  const m = 48
  if (horizontal()) {
    if (e.clientX < r.left + m) el.scrollLeft -= 12
    else if (e.clientX > r.right - m) el.scrollLeft += 12
  } else if (e.clientY < r.top + m) el.scrollTop -= 12
  else if (e.clientY > r.bottom - m) el.scrollTop += 12
}

watch(() => state.cur, async () => {
  await nextTick()
  box.value?.querySelector(`.thumb[data-page="${state.cur}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})
</script>

<template>
  <aside id="side" ref="side" aria-label="Pages" @dragover="autoScroll">
    <div
      id="thumbs" ref="box"
      @dragstart="onDragStart" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @dragend="onDragEnd"
    >
      <template v-for="(p, i) in state.pages" :key="p.id">
        <div
          class="thumb" draggable="true"
          :class="{
            cur: i + 1 === state.cur,
            del: p.deleted,
            dragging: dragFrom === i + 1,
            'drop-before': dropAt && dropAt.page === i + 1 && !dropAt.after,
            'drop-after': dropAt && dropAt.page === i + 1 && dropAt.after
          }"
          :data-page="i + 1" :data-part="partClass(i + 1)"
          @click="goTo(i + 1)"
        >
          <div class="ph"><PdfCanvas :source="state.sources[p.src]" :num="p.num" :rotation="p.rot" /></div>
          <div><span class="num">{{ i + 1 }}</span> <span class="rot">{{ p.rot ? `↻ ${p.rot}°` : '' }}</span></div>
          <div v-if="p.src" class="from" :title="'Insérée depuis ' + state.sources[p.src].name">📎 {{ state.sources[p.src].name }}</div>
        </div>
        <button
          v-if="i < state.pages.length - 1"
          type="button" class="cut"
          :class="{ on: p.cut, 'drop-cut': dropAt && dropAt.cut === i + 1 }"
          :data-after="i + 1" :title="`Couper entre les pages ${i + 1} et ${i + 2}`"
          @click="toggleCut(i + 1)"
        ><span>✂</span></button>
      </template>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  state, goTo, rotate, toggleCut, toggleDelete, setZoom, movePage, readPdf, getPdfPage
} from '../store'

const MAX_PIXELS = 16e6
const CUTLINE_SPACE = 56   // hauteur réservée sous la page pour la ligne de coupure

const stage = ref(null)
const canvas = ref(null)
const insertFile = ref(null)
const size = ref({ w: 0, h: 0 })   // taille d'affichage (px CSS) de la page

const entry = computed(() => state.pages[state.cur - 1])
const last = computed(() => state.cur === state.pages.length)

/* ---------- Rendu de la page courante ---------- */

let task = 0
async function renderMain() {
  const e = entry.value
  if (!e || !canvas.value) return
  const t = ++task
  const page = await getPdfPage(state.sources[e.src], e.num)
  const rotation = (page.rotate + e.rot) % 360
  const base = page.getViewport({ scale: 1, rotation })
  const st = stage.value
  const fit = Math.max(0.05, Math.min(
    (st.clientWidth - 32) / base.width,
    (st.clientHeight - 32 - CUTLINE_SPACE) / base.height
  ))
  const css = fit * state.zoom
  const dpr = window.devicePixelRatio || 1
  let scale = css * dpr
  const area = base.width * base.height * scale * scale
  if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area)
  const vp = page.getViewport({ scale, rotation })
  const off = document.createElement('canvas')
  off.width = Math.floor(vp.width)
  off.height = Math.floor(vp.height)
  await page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise
  if (t !== task || !canvas.value) return
  const c = canvas.value
  c.width = off.width
  c.height = off.height
  c.getContext('2d').drawImage(off, 0, 0)
  size.value = { w: base.width * css, h: base.height * css }
}

watch(() => [state.cur, entry.value?.id, entry.value?.rot, state.zoom, state.pages.length], renderMain)

let ro, timer
onMounted(() => {
  renderMain()
  ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(renderMain, 150) })
  ro.observe(stage.value)
})
onBeforeUnmount(() => { ro?.disconnect(); clearTimeout(timer) })

function onWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
}

/* ---------- Barre d'outils ---------- */

function onPageInput(e) {
  goTo(parseInt(e.target.value, 10) || state.cur)
  e.target.value = state.cur
}

async function onInsertFile() {
  const f = insertFile.value.files[0]
  insertFile.value.value = ''
  if (!f) return
  try {
    state.incoming = await readPdf(f)
  } catch (err) {
    alert(err.message)
  }
}
</script>

<template>
  <section id="viewer">
    <div class="toolbar" role="toolbar" aria-label="Outils de la page">
      <div class="grp">
        <button id="prev" class="btn" type="button" title="Page précédente (←)" :disabled="state.cur <= 1" @click="goTo(state.cur - 1)">◀</button>
        <input id="pageNum" type="number" min="1" :max="state.pages.length" :value="state.cur" aria-label="Numéro de page" @change="onPageInput">
        <span id="pageTotal">/ {{ state.pages.length }}</span>
        <button id="next" class="btn" type="button" title="Page suivante (→)" :disabled="last" @click="goTo(state.cur + 1)">▶</button>
      </div>
      <div class="grp">
        <button id="rotL" class="btn" type="button" title="Pivoter à gauche (Maj+R)" @click="rotate(state.cur, -90)">⟲</button>
        <button id="rotR" class="btn" type="button" title="Pivoter à droite (R)" @click="rotate(state.cur, 90)">⟳</button>
      </div>
      <div class="grp">
        <button id="cutBtn" class="btn" :class="{ on: entry.cut && !last }" type="button" title="Couper après cette page (C)" :disabled="last" @click="toggleCut(state.cur)">✂ Couper ici</button>
        <button id="delBtn" class="btn" :class="{ on: entry.deleted }" type="button" title="Supprimer / restaurer cette page (Suppr)" @click="toggleDelete(state.cur)">{{ entry.deleted ? '↩ Restaurer' : '🗑 Supprimer' }}</button>
      </div>
      <div class="grp">
        <button id="moveUp" class="btn" type="button" title="Déplacer la page avant (Alt+←)" :disabled="state.cur <= 1" @click="movePage(state.cur, state.cur - 1)">⬆ Monter</button>
        <button id="moveDown" class="btn" type="button" title="Déplacer la page après (Alt+→)" :disabled="last" @click="movePage(state.cur, state.cur + 1)">⬇ Descendre</button>
      </div>
      <div class="grp">
        <button id="insertBtn" class="btn" type="button" title="Insérer des pages d'un autre PDF" @click="insertFile.click()">➕ Insérer des pages…</button>
        <input id="insertFile" ref="insertFile" type="file" accept="application/pdf" hidden @change="onInsertFile">
      </div>
      <div class="grp">
        <button id="zoomOut" class="btn" type="button" title="Zoom arrière (−)" @click="setZoom(state.zoom / 1.25)">−</button>
        <button id="zoomFit" class="btn" type="button" title="Ajuster à la fenêtre (0)" @click="setZoom(1)"><span id="zoomLabel">{{ Math.round(state.zoom * 100) }} %</span></button>
        <button id="zoomIn" class="btn" type="button" title="Zoom avant (+)" @click="setZoom(state.zoom * 1.25)">+</button>
      </div>
    </div>

    <div id="stage" ref="stage" class="stage" @wheel="onWheel">
      <div id="sheet" class="sheet">
        <div id="pageWrap" class="pagewrap" :class="{ del: entry.deleted }">
          <canvas ref="canvas" :style="{ width: size.w + 'px', height: size.h + 'px' }" />
        </div>
        <button
          v-if="!last" id="cutLine" class="cutline" :class="{ on: entry.cut }" type="button"
          @click="toggleCut(state.cur)"
        >{{ entry.cut ? `✂ Coupure après la page ${state.cur} (cliquer pour retirer)` : `✂ Couper après la page ${state.cur}` }}</button>
      </div>
    </div>
  </section>
</template>

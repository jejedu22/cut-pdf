<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { state, insertPages } from '../store'
import PdfCanvas from './PdfCanvas.vue'

const src = computed(() => state.incoming)
const total = computed(() => src.value.pdf.numPages)
const picked = reactive(new Set())
const at = ref(String(state.cur))     // nombre de pages qui précèdent les pages insérées

function toggle(n) {
  if (picked.has(n)) picked.delete(n)
  else picked.add(n)
}

const pickAll = () => { for (let n = 1; n <= total.value; n++) picked.add(n) }
const close = () => { state.incoming = null }

function confirm() {
  insertPages(src.value, [...picked], +at.value)
  state.incoming = null
}

const onKey = e => { if (e.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div id="insertDlg" class="modal" role="dialog" aria-modal="true" aria-labelledby="insertTitle" @click.self="close">
    <div class="dialog">
      <h2 id="insertTitle">Pages à insérer depuis « {{ src.name }} »</h2>
      <p class="hint">Cliquez sur les pages du document source à ajouter au document ouvert.</p>
      <div class="row">
        <button id="pickAll" class="btn" type="button" @click="pickAll">Tout sélectionner</button>
        <button id="pickNone" class="btn" type="button" @click="picked.clear()">Tout désélectionner</button>
        <span id="insertCount">{{ picked.size }} page(s) sélectionnée(s)</span>
      </div>
      <div id="insertThumbs" class="picks">
        <div
          v-for="n in total" :key="n" class="pick" :class="{ sel: picked.has(n) }" :data-num="n"
          tabindex="0" role="checkbox" :aria-checked="picked.has(n)"
          @click="toggle(n)" @keydown.space.enter.prevent="toggle(n)"
        >
          <div class="ph"><PdfCanvas :source="src" :num="n" :scale="0.3" /></div>
          <span>Page {{ n }}</span>
        </div>
      </div>
      <div class="row foot">
        <label>Insérer
          <select id="insertPos" v-model="at">
            <option value="0">Au début du document</option>
            <option :value="String(state.cur)">Après la page courante ({{ state.cur }})</option>
            <option :value="String(state.pages.length)">À la fin du document</option>
          </select>
        </label>
        <span class="spacer" />
        <button id="insertCancel" class="btn" type="button" @click="close">Annuler</button>
        <button id="insertOk" class="btn primary" type="button" :disabled="!picked.size" @click="confirm">Insérer</button>
      </div>
    </div>
  </div>
</template>

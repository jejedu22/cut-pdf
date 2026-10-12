<script setup>
import { ref } from 'vue'
import {
  state, parts, sizeOf, rotateAll, cutAll, cutEvery, clearCuts, restoreDeleted,
  downloadPart, downloadZip, estimateSizes
} from '../store'
import { OPT_LEVELS } from '../lib/optimize'
import { rangesLabel, fmtSize } from '../lib/utils'

const busy = ref('')          // action en cours : 'zip', 'est' ou `part:${k}`
const progress = ref('')
const every = ref(2)

async function run(name, fn) {
  busy.value = name
  try {
    await fn()
  } catch (e) {
    alert('Erreur pendant la découpe : ' + e.message)
  } finally {
    busy.value = ''
  }
}

function sizeText(g) {
  const lvl = state.optLevel
  const before = sizeOf(g, 0)
  const after = sizeOf(g, lvl)
  if (after === undefined) return ''
  if (!lvl || !before) return fmtSize(after)
  const pct = Math.min(99, Math.abs(Math.round((1 - after / before) * 100)))
  return `${fmtSize(before)} → ${fmtSize(after)} (${after <= before ? '−' : '+'}${pct} %)`
}

const estimate = () => run('est', () => estimateSizes((k, n) => { progress.value = `Calcul… ${k}/${n}` }))
</script>

<template>
  <aside id="panel" aria-label="Résultat">
    <h2>Parties</h2>
    <ol id="partList" class="parts">
      <li v-for="(g, k) in parts" :key="k" :data-part="k % 6">
        <div class="t">
          <b>Partie {{ k + 1 }}</b>
          <span>page{{ g.length > 1 ? 's' : '' }} {{ rangesLabel(g, ', ') }} ({{ g.length }})</span>
          <span v-if="sizeText(g)" class="size">{{ sizeText(g) }}</span>
        </div>
        <button class="btn" type="button" title="Télécharger cette partie" :disabled="!!busy" @click="run(`part:${k}`, () => downloadPart(g))">{{ busy === `part:${k}` ? '…' : '⬇' }}</button>
      </li>
    </ol>
    <p v-if="!parts.length" id="partEmpty" class="hint">Toutes les pages sont supprimées.</p>
    <button v-if="parts.length > 1" id="zip" class="btn primary" type="button" :disabled="!!busy" @click="run('zip', downloadZip)">{{ busy === 'zip' ? '…' : 'Tout télécharger (ZIP)' }}</button>

    <h2>Poids des fichiers</h2>
    <label class="opt">Optimisation des images
      <select id="optLevel" v-model.number="state.optLevel">
        <option v-for="(o, lvl) in OPT_LEVELS" :key="lvl" :value="+lvl">{{ o.label }}</option>
      </select>
    </label>
    <button id="optimize" class="btn" type="button" :disabled="!!busy" @click="estimate">{{ busy === 'est' ? progress : '⚡ Optimiser et calculer le poids' }}</button>
    <p class="hint">Réduit les images JPEG (taille et qualité) ; le texte et les vecteurs restent intacts. Le niveau choisi s'applique aux téléchargements.</p>

    <h2>Actions rapides</h2>
    <div class="quick">
      <button id="allL" class="btn" type="button" @click="rotateAll(-90)">⟲ Tout pivoter à gauche</button>
      <button id="allR" class="btn" type="button" @click="rotateAll(90)">⟳ Tout pivoter à droite</button>
      <button id="cutAll" class="btn" type="button" @click="cutAll">✂ Une page par fichier</button>
      <label class="every">✂ Tous les <input id="every" v-model.number="every" type="number" min="1"> pages
        <button id="cutEvery" class="btn" type="button" @click="cutEvery(every)">OK</button></label>
      <button id="clearCuts" class="btn" type="button" @click="clearCuts">Effacer les coupures</button>
      <button id="restore" class="btn" type="button" @click="restoreDeleted">Restaurer les pages supprimées</button>
    </div>
    <p class="hint">Raccourcis : ← → naviguer · R / Maj+R pivoter · C couper · Suppr supprimer · + − 0 zoom · Alt+← → déplacer la page · glissez les miniatures pour les réordonner</p>
  </aside>
</template>

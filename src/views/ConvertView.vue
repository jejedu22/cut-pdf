<script setup>
import { ref, computed, watch } from 'vue'
import JSZip from 'jszip'
import DropZone from '../components/DropZone.vue'
import {
  ACCEPTED, convertFile, embedImages, prettyHtml, htmlDocument, htmlToMarkdown, sanitizeHtml, unsupportedImages
} from '../lib/convert'
import { saveBlob } from '../lib/utils'

const name = ref('')          // nom du fichier source, sans extension
const result = ref(null)      // { html, images, warnings }
const error = ref('')
const busy = ref(false)
const format = ref('markdown')
const imageMode = ref('files')   // 'files' : images séparées (ZIP) · 'embed' : images intégrées (base64)
const fullDoc = ref(true)        // HTML : document complet ou simple fragment
const tab = ref('result')
const copied = ref(false)
const drop = ref(null)

// Valeurs par défaut les plus pratiques selon le format
watch(format, f => { imageMode.value = f === 'html' ? 'embed' : 'files' })

async function load(file) {
  error.value = ''
  if (!/\.(docx|odt)$/i.test(file.name)) {
    error.value = 'Format non pris en charge : choisissez un fichier .docx ou .odt.'
    return
  }
  busy.value = true
  try {
    result.value = await convertFile(file)
    name.value = file.name.replace(/\.(docx|odt)$/i, '')
    tab.value = 'result'
  } catch (e) {
    result.value = null
    error.value = `Conversion impossible : ${e.message}`
  } finally {
    busy.value = false
  }
}

const hasImages = computed(() => !!result.value?.images.length)
const ext = computed(() => (format.value === 'html' ? 'html' : 'md'))
const asZip = computed(() => imageMode.value === 'files' && hasImages.value)

const output = computed(() => {
  if (!result.value) return ''
  const body = imageMode.value === 'embed' ? embedImages(result.value.html, result.value.images) : result.value.html
  if (format.value === 'markdown') return htmlToMarkdown(body)
  const html = prettyHtml(body)
  return fullDoc.value ? htmlDocument(html, name.value) : html
})

// Dans l'affichage, les images base64 sont abrégées (le fichier téléchargé reste complet)
const shown = computed(() => output.value.replace(/(data:[^;"')\s]+;base64,)[A-Za-z0-9+/=]+/g, '$1…'))
const preview = computed(() => (result.value ? sanitizeHtml(embedImages(result.value.html, result.value.images)) : ''))
const badImages = computed(() => (result.value ? unsupportedImages(result.value.images) : 0))

async function download() {
  const file = `${name.value}.${ext.value}`
  const type = format.value === 'html' ? 'text/html' : 'text/markdown'
  if (asZip.value) {
    const zip = new JSZip()
    zip.file(file, output.value)
    result.value.images.forEach(i => zip.file(`images/${i.name}`, i.bytes))
    saveBlob(await zip.generateAsync({ type: 'blob' }), `${name.value}.zip`)
  } else {
    saveBlob(new Blob([output.value], { type: `${type};charset=utf-8` }), file)
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    error.value = 'Copie impossible : sélectionnez le texte et copiez-le manuellement.'
  }
}
</script>

<template>
  <main class="convert">
    <h2 class="page-title">Convertir un document Word ou OpenDocument</h2>
    <p class="hint">Transformez un fichier <b>.docx</b> ou <b>.odt</b> en Markdown ou en HTML. La conversion se fait dans votre navigateur.</p>

    <DropZone
      ref="drop" :accept="ACCEPTED" title="Déposez un fichier .docx ou .odt ici"
      hint="Vos fichiers restent dans votre navigateur : rien n'est envoyé sur un serveur."
      @file="load"
    />
    <p v-if="busy" class="hint">Conversion en cours…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="result" class="result">
      <div class="options panel-box">
        <div class="opt">
          <span class="lbl">Format de sortie</span>
          <div class="seg" role="radiogroup" aria-label="Format de sortie">
            <label><input v-model="format" type="radio" value="markdown"> Markdown (.md)</label>
            <label><input v-model="format" type="radio" value="html"> HTML (.html)</label>
          </div>
        </div>
        <label v-if="format === 'html'" class="check"><input v-model="fullDoc" type="checkbox"> Document HTML complet (sinon, simple fragment)</label>
        <label v-if="hasImages" class="opt">Images ({{ result.images.length }})
          <select v-model="imageMode">
            <option value="files">Fichiers séparés (téléchargement en ZIP)</option>
            <option value="embed">Intégrées au fichier (base64)</option>
          </select>
        </label>
      </div>

      <ul v-if="result.warnings.length || badImages" class="warn">
        <li v-if="badImages">{{ badImages }} image(s) dans un format que le navigateur ne peut pas afficher (EMF/WMF) : elles sont conservées mais n'apparaissent pas dans l'aperçu.</li>
        <li v-for="w in result.warnings" :key="w">{{ w }}</li>
      </ul>

      <div class="bar">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="tab === 'result'" :class="{ on: tab === 'result' }" @click="tab = 'result'">{{ format === 'html' ? 'Code HTML' : 'Markdown' }}</button>
          <button type="button" role="tab" :aria-selected="tab === 'preview'" :class="{ on: tab === 'preview' }" @click="tab = 'preview'">Aperçu du document</button>
        </div>
        <span class="spacer" />
        <button id="copy" class="btn" type="button" @click="copy">{{ copied ? '✓ Copié' : 'Copier' }}</button>
        <button id="download" class="btn primary" type="button" @click="download">⬇ Télécharger {{ asZip ? '(ZIP avec images)' : `(.${ext})` }}</button>
      </div>

      <textarea v-if="tab === 'result'" id="output" class="code" readonly :value="shown" spellcheck="false" aria-label="Résultat de la conversion" />
      <article v-else id="preview" class="doc-preview" v-html="preview" />
      <p v-if="tab === 'result' && output.includes('base64,')" class="hint">Les données d'image base64 sont abrégées (…) dans l'affichage ; le fichier téléchargé et la copie sont complets.</p>
    </section>
  </main>
</template>

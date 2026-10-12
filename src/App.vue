<template>
  <header class="top">
    <h1>✂️ Cut PDF</h1>
    <nav class="nav" aria-label="Navigation">
      <RouterLink :to="{ name: 'pdf' }">Découper un PDF</RouterLink>
      <RouterLink :to="{ name: 'convert' }">Convertir un document</RouterLink>
    </nav>
    <div id="header-slot" class="slot" />
  </header>
  <RouterView />
</template>

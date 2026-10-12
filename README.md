# Cut PDF

Application web 100 % côté client pour découper des PDF (aucun envoi de fichier).

## Fonctions
Visualiseur avec miniatures à gauche, page courante en grand au centre, parties produites à droite.
- **Ciseaux ✂** : entre deux miniatures, sous la page ou via le bouton « Couper ici » (touche `C`) ; chaque coupure ouvre une nouvelle partie (un fichier par partie)
- **Rotation** ⟲ ⟳ par page ou pour tout le document
- **Suppression / restauration** d'une page (touche `Suppr`)
- **Zoom** (+ − 0, Ctrl + molette) et navigation (← →, saisie du numéro de page)
- **Réordonner** : glisser-déposer des miniatures (sur une page ou sur un ✂), ou boutons « Monter / Descendre » (Alt+← →)
- **Fusion** : « Insérer des pages… » ouvre un second PDF, permet de choisir ses pages sur miniatures et de les insérer au début, après la page courante ou à la fin du document ouvert
- Actions rapides : une page par fichier, couper toutes les N pages, effacer les coupures
- **Optimisation du poids** : réduction des images JPEG (3 niveaux), avec calcul du poids avant/après par partie ; texte et vecteurs conservés
- Téléchargement partie par partie ou en ZIP

## Convertir un document (page « Convertir un document », `#/convertir`)
- Entrée : fichiers **.docx** (via mammoth) et **.odt** (lecture directe de `content.xml`)
- Sortie au choix : **Markdown** (GFM : tableaux, barré, notes de bas de page `[^1]`) ou **HTML** (document complet ou fragment)
- Images : intégrées en base64, ou fichiers séparés dans un ZIP (`images/`)
- Aperçu du document, copie dans le presse-papiers, téléchargement ; tout se passe dans le navigateur

## Développement
Application Vue 3 (composants monofichier) construite avec Vite ; PDF via pdf-lib, pdf.js et JSZip.
```
npm install
npm run dev      # serveur de développement
npm run build    # production dans dist/
```
Navigation par `vue-router` (historique « hash », aucune règle de réécriture nginx). Structure : `src/views/` (les deux pages), `src/store.js` (état et actions PDF), `src/lib/convert/` (conversion docx/odt → HTML → Markdown), `src/components/` (viseur, miniatures, panneau, fenêtre d'insertion), `src/lib/` (optimisation, utilitaires).

## Docker + Traefik
```
cp .env.example .env   # renseigner CUT_PDF_HOST (et, si besoin, réseau / entrypoint / certresolver)
docker compose up -d --build
```
L'image est construite en deux étapes (build Vite, puis nginx). Le conteneur (nginx non privilégié, port 8080) rejoint le réseau Docker externe de Traefik et est exposé en HTTPS via les labels de `docker-compose.yml`. Prérequis : un Traefik avec le provider Docker, un entrypoint `websecure` et un certresolver `letsencrypt` (ajustables via `.env`).

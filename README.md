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
- Téléchargement partie par partie ou en ZIP

## Utilisation
Servir le dossier avec n'importe quel serveur statique, par ex. `python3 -m http.server 8000`, puis ouvrir http://localhost:8000.

Bibliothèques embarquées dans `vendor/` : pdf-lib, pdf.js, JSZip.

## Docker + Traefik
```
cp .env.example .env   # renseigner CUT_PDF_HOST (et, si besoin, réseau / entrypoint / certresolver)
docker compose up -d --build
```
Le conteneur (nginx non privilégié, port 8080) rejoint le réseau Docker externe de Traefik et est exposé en HTTPS via les labels de `docker-compose.yml`. Prérequis : un Traefik avec le provider Docker, un entrypoint `websecure` et un certresolver `letsencrypt` (ajustables via `.env`).

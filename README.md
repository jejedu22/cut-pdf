# Cut PDF

Application web 100 % côté client pour découper des PDF (aucun envoi de fichier).

## Fonctions
- Découpe par plages (`1-3, 4-6, 9`), pages sélectionnées sur miniatures, tous les N pages, une page par fichier
- Téléchargement fichier par fichier ou en ZIP

## Utilisation
Servir le dossier avec n'importe quel serveur statique, par ex. `python3 -m http.server 8000`, puis ouvrir http://localhost:8000.

Bibliothèques embarquées dans `vendor/` : pdf-lib, pdf.js, JSZip.

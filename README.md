# VinduesPuds Pro

Lokal PWA til GitHub Pages med:
- Prisudregner til vinduespudsning
- Vinduestyper med Start Pris som fast post
- Kundedatabase i IndexedDB
- Offline cache via service worker
- Installérbar som app på Android/iPhone

## Upload til GitHub Pages

1. Opret et repository på GitHub.
2. Upload alle filer fra denne mappe til roden af repository'et.
3. Gå til **Settings → Pages**.
4. Vælg **Deploy from a branch**.
5. Vælg branch **main** og mappen **/(root)**.
6. Gem.
7. Når siden er live, åbner du den på telefonen og vælger **Installer app** eller **Føj til hjemmeskærm**.

## Bemærk

- Alle kunder og priser gemmes lokalt på den enhed, hvor appen bruges.
- GitHub Pages er statisk hosting, så data synkroniseres ikke mellem flere telefoner/computere.
- Prisdata på kunder opdateres ikke automatisk, når master-priser ændres. Det skal redigeres manuelt, præcis som ønsket.

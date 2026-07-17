# Spectre

Eine minimalistische, installierbare Eisenhower-Matrix mit anpassbarer Liquid-Glass-Oberfläche. Aufgaben und Einstellungen bleiben ausschließlich im lokalen Browserprofil.

## Entwicklung

```bash
npm install
npm run dev
```

## Prüfung

```bash
npm test
npm run build
```

Der Produktions-Build in `dist/` enthält das PWA-Manifest und den Offline-Service-Worker.

## Kostenlose Veröffentlichung

Nach dem Veröffentlichen des Repositorys kann GitHub Pages die App automatisch bauen. Unter **Settings → Pages → Build and deployment → Source** einmal **GitHub Actions** auswählen. Jeder spätere Push auf `main` veröffentlicht dann automatisch die aktuelle Version.

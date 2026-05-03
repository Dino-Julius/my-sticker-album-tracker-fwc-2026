# My Sticker Album Tracker FWC 2026

Tracker mobile-first para controlar estampas faltantes, repetidas y disponibles para intercambio del álbum Panini Mundial 2026.

Nombre sugerido para el repositorio:

```text
my-sticker-album-tracker-fwc-2026
```

## Stack

- React
- Vite
- TypeScript
- Yarn classic
- Catálogo maestro estático en `public/catalog.json` con 994 stickers
- Progreso personal en `localStorage`
- PWA básica con `manifest.webmanifest` y service worker

## Desarrollo local

```zsh
yarn install
yarn dev
```

## Build

```zsh
yarn build
yarn preview
```

## Catálogo

El app nunca modifica `public/catalog.json`. El catálogo incluido contiene 994 stickers con nombres oficiales de país/equipo. Para extender o corregir el catálogo, conserva una lista de objetos con esta forma:

```json
{
  "code": "MEX1",
  "country": "México",
  "group": "Grupo A",
  "section": "Team",
  "number": 1,
  "displayName": "Escudo"
}
```

El progreso del usuario se guarda aparte en `localStorage` como un diccionario:

```json
{
  "MEX1": 1,
  "MEX2": 0,
  "MEX3": 3
}
```

## GitHub Pages

La app usa pestañas internas, no rutas del navegador, para evitar problemas de refresh en GitHub Pages.

`vite.config.ts` está configurado con:

```ts
base: "/my-sticker-album-tracker-fwc-2026/";
```

El workflow de GitHub Actions incluido instala dependencias con Yarn, construye la app y publica `dist` en GitHub Pages cuando haces push a `main`.

```zsh
yarn build
```

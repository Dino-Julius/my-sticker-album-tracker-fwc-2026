# My Sticker Album Tracker FWC 2026

Tracker mobile-first para controlar estampas faltantes, repetidas e intercambios del album Panini / FIFA World Cup 2026.

## Stack

- React + Vite + TypeScript
- Yarn classic
- Catalogo maestro estatico en `public/catalog.json` con 994 stickers
- Progreso personal en `localStorage`
- Historial de intercambios en `localStorage`
- Supabase opcional para usuarios y sincronizacion en la nube
- PWA basica con `manifest.webmanifest` y service worker
- GitHub Pages

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

## Catalogo

La app nunca modifica ni sube `public/catalog.json` a Supabase. El catalogo incluido contiene 994 stickers con nombres oficiales de pais/equipo. Para extender o corregir el catalogo, conserva una lista de objetos con esta forma:

```json
{
  "code": "MEX1",
  "country": "Mexico",
  "group": "Grupo A",
  "section": "Team",
  "number": 1,
  "displayName": "Escudo"
}
```

## Almacenamiento local

El progreso se guarda como diccionario `Record<string, number>`:

```json
{
  "MEX1": 1,
  "MEX2": 0,
  "MEX3": 3
}
```

Llaves actuales de `localStorage`:

- `my-sticker-album-tracker-fwc-2026-progress`
- `my-sticker-album-tracker-fwc-2026-trades`

La app sigue funcionando 100% local si Supabase no esta configurado o si no hay sesion iniciada. Cuando hay sesion, `localStorage` se conserva como cache/respaldo y no se borra despues de migrar datos a la nube.

## Supabase opcional

Crea un archivo `.env.local` para desarrollo local:

```zsh
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
```

La app tambien acepta `VITE_SUPABASE_ANON_KEY` como fallback por compatibilidad con configuraciones anteriores. Usa solamente la publishable/anon key publica de Supabase. No uses ni guardes una `service_role` key en esta app.

En GitHub Actions configura estos secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Si ya tienes `VITE_SUPABASE_ANON_KEY`, tambien funciona como fallback.

La autenticacion usa magic links. Si el usuario inicia sesion, la app sincroniza progreso e historial de intercambios en Supabase; si no, usa almacenamiento local.

## SQL Supabase

Ejecuta este SQL manualmente en Supabase para crear tablas y RLS:

```sql
create table public.album_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.trade_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  created_at text not null,
  traded_with text,
  notes text,
  gave jsonb not null default '[]'::jsonb,
  received jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.album_progress enable row level security;
alter table public.trade_records enable row level security;

create policy "Users can read own progress"
on public.album_progress
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own progress"
on public.album_progress
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own progress"
on public.album_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own trades"
on public.trade_records
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own trades"
on public.trade_records
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own trades"
on public.trade_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own trades"
on public.trade_records
for delete
to authenticated
using (auth.uid() = user_id);
```

## Flujo de migracion

Despues de iniciar sesion, la app compara datos locales contra datos en la nube:

- Si hay datos locales y la nube esta vacia, ofrece subir datos locales.
- Si hay datos locales y datos en la nube, ofrece usar nube, subir local o combinar.
- Al combinar, el progreso usa la cantidad maxima por codigo y los intercambios se combinan por `id`.
- La migracion no elimina `localStorage`; lo mantiene como cache/fallback.

## GitHub Pages

La app usa pestanas internas, no rutas del navegador, para evitar problemas de refresh en GitHub Pages.

`vite.config.ts` esta configurado con:

```ts
base: "/my-sticker-album-tracker-fwc-2026/";
```

Si cambias el nombre del repo, ajusta el `base`:

```ts
base: "/NOMBRE_DEL_REPO/";
```

El workflow de GitHub Actions instala dependencias con Yarn, construye la app y publica `dist` en GitHub Pages cuando haces push a `main`.

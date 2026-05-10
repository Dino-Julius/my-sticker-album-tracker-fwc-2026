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

## Instalar como app

La app incluye soporte PWA basico, asi que puedes agregarla a la pantalla de inicio en dispositivos compatibles.

En iPhone o iPad:

1. Abre la app en Safari.
2. Toca el boton de compartir.
3. Elige `Agregar a pantalla de inicio`.
4. Confirma el nombre y toca `Agregar`.

En Android con Chrome:

1. Abre la app en Chrome.
2. Toca el menu de tres puntos.
3. Elige `Agregar a pantalla principal` o `Instalar app`.
4. Confirma la instalacion.

En navegadores de escritorio compatibles, busca el icono de instalar en la barra de direcciones o usa el menu del navegador.

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
- `my-sticker-album-tracker-fwc-2026-registration-events`
- `my-sticker-album-tracker-fwc-2026-pending-trades`

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

La autenticacion usa Google OAuth con Supabase. Si el usuario inicia sesion, la app sincroniza progreso e historial de intercambios en Supabase; si no, usa almacenamiento local.

### Configurar login con Google

En Supabase:

1. Ve a `Authentication` -> `Providers` -> `Google`.
2. Activa el proveedor de Google.
3. Pega el `Client ID` y `Client Secret` creados en Google Cloud.

En Google Cloud:

1. Configura el OAuth consent screen.
2. Crea un OAuth Client ID de tipo `Web application`.
3. Agrega estos Authorized JavaScript origins:
   - `https://dino-julius.github.io`
   - `http://localhost:5173`
4. Agrega tu Authorized redirect URI

En Supabase URL Configuration:

1. Site URL:
   - `https://dino-julius.github.io/my-sticker-album-tracker-fwc-2026/`
2. Redirect URLs:
   - `https://dino-julius.github.io/my-sticker-album-tracker-fwc-2026/**`
   - `http://localhost:5173/**`

## SQL Supabase

Ejecuta este SQL manualmente en Supabase para crear tablas y RLS:

```sql
create table if not exists public.album_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_records (
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

create table if not exists public.pending_trades (
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

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  nickname text,
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  created_at text not null,
  source text not null,
  action text not null,
  items jsonb not null default '[]'::jsonb,
  note text,
  saved_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists registration_events_user_id_created_at_idx
on public.registration_events (user_id, created_at desc);

create index if not exists pending_trades_user_id_saved_at_idx
on public.pending_trades (user_id, saved_at desc);

alter table public.album_progress enable row level security;
alter table public.trade_records enable row level security;
alter table public.pending_trades enable row level security;
alter table public.profiles enable row level security;
alter table public.registration_events enable row level security;

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

create policy "Users can read own pending trades"
on public.pending_trades
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own pending trades"
on public.pending_trades
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own pending trades"
on public.pending_trades
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own pending trades"
on public.pending_trades
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own registration events"
on public.registration_events
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own registration events"
on public.registration_events
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own registration events"
on public.registration_events
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own registration events"
on public.registration_events
for delete
to authenticated
using (auth.uid() = user_id);
```

### SQL propuesto para Amigos (Phase B)

**DO NOT RUN YET — proposal only.** Este bloque es aditivo y esta pensado para habilitar invitaciones por codigo, solicitudes de amistad y snapshots minimos de intercambio sin abrir `album_progress`, `pending_trades`, `trade_records` ni `registration_events` a otros usuarios.

```sql
create extension if not exists pgcrypto;

create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by_user_id uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'used', 'expired', 'revoked'))
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'removed', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> receiver_user_id)
);

create unique index if not exists friendships_unique_pair_idx
on public.friendships (
  least(requester_user_id, receiver_user_id),
  greatest(requester_user_id, receiver_user_id)
);

create table if not exists public.friend_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.friend_exchange_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  completion_percentage integer not null default 0,
  owned_count integer not null default 0,
  missing_count integer not null default 0,
  repeated_count integer not null default 0,
  extras_count integer not null default 0,
  missing_codes jsonb not null default '[]'::jsonb,
  extras jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists friend_invites_created_by_idx
on public.friend_invites (created_by_user_id, status, expires_at desc);

create index if not exists friend_invites_code_idx
on public.friend_invites (code);

create index if not exists friendships_requester_idx
on public.friendships (requester_user_id, status, updated_at desc);

create index if not exists friendships_receiver_idx
on public.friendships (receiver_user_id, status, updated_at desc);

alter table public.friend_invites enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_public_profiles enable row level security;
alter table public.friend_exchange_snapshots enable row level security;

create policy "Users can read own invites"
on public.friend_invites
for select
to authenticated
using (
  auth.uid() = created_by_user_id
  or auth.uid() = used_by_user_id
);

create policy "Users can read own friendships"
on public.friendships
for select
to authenticated
using (
  auth.uid() = requester_user_id
  or auth.uid() = receiver_user_id
);

create policy "Users can upsert own public profile"
on public.friend_public_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own public profile"
on public.friend_public_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Friends can read public profile previews"
on public.friend_public_profiles
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.friendships f
    where f.status in ('pending', 'accepted')
      and (
        (f.requester_user_id = auth.uid() and f.receiver_user_id = friend_public_profiles.user_id)
        or
        (f.receiver_user_id = auth.uid() and f.requester_user_id = friend_public_profiles.user_id)
      )
  )
);

create policy "Users can upsert own exchange snapshot"
on public.friend_exchange_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own exchange snapshot"
on public.friend_exchange_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Accepted friends can read exchange snapshots"
on public.friend_exchange_snapshots
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_user_id = auth.uid() and f.receiver_user_id = friend_exchange_snapshots.user_id)
        or
        (f.receiver_user_id = auth.uid() and f.requester_user_id = friend_exchange_snapshots.user_id)
      )
  )
);

create or replace function public.create_friend_invite()
returns public.friend_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  active_invite_count integer;
  next_code text;
  next_invite public.friend_invites;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  update public.friend_invites
  set status = 'expired'
  where created_by_user_id = auth.uid()
    and status = 'active'
    and expires_at <= now();

  select count(*)
  into active_invite_count
  from public.friend_invites
  where created_by_user_id = auth.uid()
    and status = 'active'
    and expires_at > now();

  if active_invite_count >= 5 then
    raise exception 'Ya tienes 5 codigos activos.';
  end if;

  loop
    next_code := upper(
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)
      || '-'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)
    );

    exit when not exists (
      select 1 from public.friend_invites where code = next_code
    );
  end loop;

  insert into public.friend_invites (code, created_by_user_id, expires_at)
  values (next_code, auth.uid(), now() + interval '7 days')
  returning * into next_invite;

  return next_invite;
end;
$$;

create or replace function public.redeem_friend_invite(p_code text)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  invite_row public.friend_invites;
  existing_friendship public.friendships;
  next_friendship public.friendships;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  normalized_code := upper(trim(p_code));

  select *
  into invite_row
  from public.friend_invites
  where code = normalized_code
  for update;

  if invite_row.id is null or invite_row.status <> 'active' then
    raise exception 'Codigo de amigo invalido.';
  end if;

  if invite_row.expires_at <= now() then
    update public.friend_invites
    set status = 'expired'
    where id = invite_row.id;
    raise exception 'Este codigo ya expiro.';
  end if;

  if invite_row.created_by_user_id = auth.uid() then
    raise exception 'No puedes agregarte a ti mismo.';
  end if;

  select *
  into existing_friendship
  from public.friendships
  where least(requester_user_id, receiver_user_id) = least(auth.uid(), invite_row.created_by_user_id)
    and greatest(requester_user_id, receiver_user_id) = greatest(auth.uid(), invite_row.created_by_user_id)
  for update;

  if existing_friendship.id is not null then
    if existing_friendship.status = 'blocked' then
      raise exception 'No se puede crear esta amistad.';
    end if;

    if existing_friendship.status in ('accepted', 'pending') then
      update public.friend_invites
      set status = 'used',
        used_by_user_id = auth.uid(),
        used_at = now()
      where id = invite_row.id;
      return existing_friendship;
    end if;

    update public.friendships
    set requester_user_id = auth.uid(),
      receiver_user_id = invite_row.created_by_user_id,
      status = 'pending',
      updated_at = now()
    where id = existing_friendship.id
    returning * into next_friendship;
  else
    insert into public.friendships (requester_user_id, receiver_user_id, status)
    values (auth.uid(), invite_row.created_by_user_id, 'pending')
    returning * into next_friendship;
  end if;

  update public.friend_invites
  set status = 'used',
    used_by_user_id = auth.uid(),
    used_at = now()
  where id = invite_row.id;

  return next_friendship;
end;
$$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_action text)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
  next_friendship public.friendships;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  next_status := case lower(trim(p_action))
    when 'accept' then 'accepted'
    when 'accepted' then 'accepted'
    when 'reject' then 'rejected'
    when 'rejected' then 'rejected'
    else null
  end;

  if next_status is null then
    raise exception 'Respuesta invalida.';
  end if;

  update public.friendships
  set status = next_status,
    updated_at = now()
  where id = p_friendship_id
    and receiver_user_id = auth.uid()
    and status = 'pending'
  returning * into next_friendship;

  if next_friendship.id is null then
    raise exception 'Solicitud no encontrada.';
  end if;

  return next_friendship;
end;
$$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  next_friendship public.friendships;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  update public.friendships
  set status = 'removed',
    updated_at = now()
  where id = p_friendship_id
    and (requester_user_id = auth.uid() or receiver_user_id = auth.uid())
    and status in ('pending', 'accepted')
  returning * into next_friendship;

  if next_friendship.id is null then
    raise exception 'Amigo no encontrado.';
  end if;

  return next_friendship;
end;
$$;

create or replace function public.revoke_friend_invite(p_invite_id uuid)
returns public.friend_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  next_invite public.friend_invites;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  update public.friend_invites
  set status = 'revoked'
  where id = p_invite_id
    and created_by_user_id = auth.uid()
    and status = 'active'
  returning * into next_invite;

  if next_invite.id is null then
    raise exception 'Codigo no encontrado.';
  end if;

  return next_invite;
end;
$$;

grant execute on function public.create_friend_invite() to authenticated;
grant execute on function public.redeem_friend_invite(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, text) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.revoke_friend_invite(uuid) to authenticated;
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

## Wiki

La carpeta `wiki/` contiene paginas listas para publicar en la Wiki de GitHub del repositorio.

- [Como actualizar la app si se quedo en una version vieja](wiki/Actualizar-la-app-si-se-quedo-en-una-version-vieja.md)

Para publicarlas en GitHub Wiki, copia los archivos de `wiki/` al repositorio wiki:

```zsh
git clone git@github.com:Dino-Julius/my-sticker-album-tracker-fwc-2026.wiki.git
cp wiki/*.md my-sticker-album-tracker-fwc-2026.wiki/
cd my-sticker-album-tracker-fwc-2026.wiki
git add Home.md _Sidebar.md Actualizar-la-app-si-se-quedo-en-una-version-vieja.md
git commit -m "Add app update guide"
git push
```

## Licencia

Licensed under the MIT License.

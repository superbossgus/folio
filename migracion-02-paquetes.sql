-- Solo si ya habías ejecutado esquema.sql antes de que existieran los
-- paquetes. Si vas a cargar todo desde cero, ignora este archivo: ya
-- viene incluido en esquema.sql.
--
-- Después de correr esto hay que volver a ejecutar vistas.sql, que es
-- donde vive crear_paquete().

create table if not exists paquetes (
  id              uuid primary key default gen_random_uuid(),
  razon_social_id uuid not null references razones_sociales(id) on delete cascade,
  destinatario    text not null,
  organizacion    text,
  correo          citext,
  motivo          text,
  marca_agua      text,
  archivo         text not null,
  creado_en       timestamptz not null default now(),
  creado_por      uuid references perfiles(id)
);
create index if not exists paquetes_rs_fecha on paquetes (razon_social_id, creado_en desc);

create table if not exists paquete_items (
  paquete_id  uuid not null references paquetes(id) on delete cascade,
  version_id  uuid not null references documento_versiones(id) on delete restrict,
  etiqueta    text not null,
  archivo     text not null,
  primary key (paquete_id, version_id)
);

create table if not exists paquete_descargas (
  id          bigserial primary key,
  paquete_id  uuid not null references paquetes(id) on delete cascade,
  perfil_id   uuid references perfiles(id) on delete set null,
  bytes       bigint,
  ip          inet,
  ocurrio_en  timestamptz not null default now()
);
create index if not exists paquete_descargas_paq_fecha
  on paquete_descargas (paquete_id, ocurrio_en desc);

alter table paquetes          enable row level security;
alter table paquete_items     enable row level security;
alter table paquete_descargas enable row level security;

drop policy if exists p_paq_lee on paquetes;
create policy p_paq_lee on paquetes for select using (razon_social_id in (select rs_visibles()));
drop policy if exists p_paq_ins on paquetes;
create policy p_paq_ins on paquetes for insert
  with check (razon_social_id in (select rs_editables()));

drop policy if exists p_pi_lee on paquete_items;
create policy p_pi_lee on paquete_items for select
  using (exists (select 1 from paquetes p where p.id = paquete_id and p.razon_social_id in (select rs_visibles())));
drop policy if exists p_pi_ins on paquete_items;
create policy p_pi_ins on paquete_items for insert
  with check (exists (select 1 from paquetes p where p.id = paquete_id and p.razon_social_id in (select rs_editables())));

drop policy if exists p_pd_lee on paquete_descargas;
create policy p_pd_lee on paquete_descargas for select
  using (exists (select 1 from paquetes p where p.id = paquete_id and p.razon_social_id in (select rs_visibles())));
drop policy if exists p_pd_ins on paquete_descargas;
create policy p_pd_ins on paquete_descargas for insert
  with check (exists (select 1 from paquetes p where p.id = paquete_id and p.razon_social_id in (select rs_visibles())));

drop trigger if exists t_bit_paq on paquetes;
create trigger t_bit_paq after insert on paquetes
  for each row execute function registrar();

-- El registro de lo que salió por correo no se corrige después.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update, delete on paquetes from %I', r);
      execute format('revoke update, delete on paquete_items from %I', r);
      execute format('revoke update, delete on paquete_descargas from %I', r);
    end if;
  end loop;
end $$;

-- =====================================================================
-- FOLIO · esquema de base de datos
-- Postgres 15 / Supabase
--
-- Principio de diseño: ningún renglón de este esquema es accesible sin
-- pasar por una política de seguridad a nivel de renglón. El filtrado
-- por inquilino NO vive en el código de la aplicación, vive aquí. Si
-- mañana alguien comete un error en el backend, la base de datos sigue
-- negando el acceso.
--
-- Orden de ejecución: este archivo completo, de una sola vez, en el
-- SQL editor de Supabase.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =====================================================================
-- 1. INQUILINOS
--    Una organización es quien paga. Una razón social es la unidad de
--    aislamiento de datos. Casi ningún cliente mediano en México tiene
--    una sola razón social, así que el contrato es por grupo y el
--    expediente es por RFC.
-- =====================================================================

create table organizaciones (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  plan            text not null default 'prueba'
                    check (plan in ('prueba','esencial','profesional','corporativo')),
  estado          text not null default 'activa'
                    check (estado in ('activa','suspendida','cancelada')),
  -- referencia al proveedor de cobro; se llena cuando se conecta Stripe
  cliente_cobro   text,
  creada_en       timestamptz not null default now()
);

create table razones_sociales (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete restrict,
  nombre          text not null,
  rfc             citext not null,
  regimen         text,
  domicilio       text,
  activa          boolean not null default true,
  creada_en       timestamptz not null default now(),
  unique (organizacion_id, rfc)
);
create index on razones_sociales (organizacion_id);

-- =====================================================================
-- 2. PERSONAS Y PERMISOS
--    El acceso se otorga por razón social, no por organización. Un
--    contador externo puede ver una sola empresa del grupo.
-- =====================================================================

create table perfiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text not null,
  correo          citext not null,
  telefono        text,
  mfa_obligatorio boolean not null default false,
  creado_en       timestamptz not null default now()
);

create type rol as enum ('propietario','administrador','capturista','lectura','auditor');

create table membresias (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  perfil_id       uuid not null references perfiles(id) on delete cascade,
  rol             rol  not null default 'lectura',
  -- null = acceso a todas las razones sociales de la organización
  razon_social_id uuid references razones_sociales(id) on delete cascade,
  invitada_por    uuid references perfiles(id),
  creada_en       timestamptz not null default now(),
  unique (perfil_id, organizacion_id, razon_social_id)
);
create index on membresias (perfil_id);
create index on membresias (organizacion_id);

-- Funciones auxiliares. Van con SECURITY DEFINER para que las políticas
-- de RLS puedan consultar membresias sin provocar recursión infinita.

create or replace function rs_visibles()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select rs.id
  from razones_sociales rs
  join membresias m on m.organizacion_id = rs.organizacion_id
  where m.perfil_id = auth.uid()
    and (m.razon_social_id is null or m.razon_social_id = rs.id)
$$;

create or replace function rs_editables()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select rs.id
  from razones_sociales rs
  join membresias m on m.organizacion_id = rs.organizacion_id
  where m.perfil_id = auth.uid()
    and m.rol in ('propietario','administrador','capturista')
    and (m.razon_social_id is null or m.razon_social_id = rs.id)
$$;

create or replace function es_admin(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membresias
    where perfil_id = auth.uid() and organizacion_id = org
      and rol in ('propietario','administrador'))
$$;

-- =====================================================================
-- 3. CATÁLOGOS COMPARTIDOS
--    Instituciones, tipos de documento y reglas de vigencia son
--    conocimiento acumulado. Viven a nivel global (organizacion_id
--    nulo) y cada cliente puede sobrescribirlos sin tocar el global.
--    Este es el activo del producto: nadie más lo tiene.
-- =====================================================================

create table instituciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references organizaciones(id) on delete cascade, -- null = global
  nombre          text not null,
  tipo            text not null
                    check (tipo in ('banco','sofom','arrendadora','factoraje','banca_desarrollo','otro')),
  activa          boolean not null default true
);
create unique index on instituciones (coalesce(organizacion_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(nombre));

create type producto as enum
  ('credito_simple','credito_revolvente','credito_cuenta_corriente',
   'factoraje','arrendamiento_puro','arrendamiento_financiero','carta_credito');

create or replace function etiqueta_producto(p producto)
returns text language sql immutable as $$
  select case p
    when 'credito_simple'          then 'Crédito simple'
    when 'credito_revolvente'      then 'Crédito revolvente'
    when 'credito_cuenta_corriente'then 'Crédito en cuenta corriente'
    when 'factoraje'               then 'Línea de factoraje'
    when 'arrendamiento_puro'      then 'Arrendamiento puro'
    when 'arrendamiento_financiero'then 'Arrendamiento financiero'
    when 'carta_credito'           then 'Carta de crédito'
  end $$;

create table tipos_documento (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid references organizaciones(id) on delete cascade, -- null = global
  clave                 text not null,          -- 'csf', 'op32d', 'acta'
  nombre                text not null,
  categoria             text not null
                          check (categoria in ('corporativo','fiscal','financiero','garantias','personas','domicilio','otros')),
  -- vigencia por omisión, cuando ninguna institución define la suya
  vigencia_dias         integer,                 -- null = no caduca
  aplica_a_persona      boolean not null default false,
  contiene_datos_personales boolean not null default false,
  activo                boolean not null default true
);
create unique index on tipos_documento (coalesce(organizacion_id,'00000000-0000-0000-0000-000000000000'::uuid), clave);

-- La regla que hace defendible al producto: la misma hoja de papel
-- tiene distinto veredicto según quién la pida. Se versiona con fecha
-- porque las instituciones cambian de criterio.
create table reglas_vigencia (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid references organizaciones(id) on delete cascade, -- null = global
  institucion_id    uuid not null references instituciones(id) on delete cascade,
  tipo_documento_id uuid not null references tipos_documento(id) on delete cascade,
  producto          producto,                    -- null = aplica a todos
  dias_maximos      integer not null check (dias_maximos > 0),
  fuente            text,                        -- quién lo confirmó y cuándo
  vigente_desde     date not null default current_date,
  vigente_hasta     date,
  creada_por        uuid references perfiles(id)
);
create index on reglas_vigencia (institucion_id, tipo_documento_id);

-- Qué pide cada institución para cada producto.
create table plantillas_requisito (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid references organizaciones(id) on delete cascade,
  institucion_id    uuid not null references instituciones(id) on delete cascade,
  producto          producto not null,
  tipo_documento_id uuid references tipos_documento(id) on delete restrict,
  nombre_libre      text,                        -- requisito sin equivalente en la bóveda
  obligatorio       boolean not null default true,
  orden             integer not null default 0,
  nota              text,
  check (tipo_documento_id is not null or nombre_libre is not null)
);
create index on plantillas_requisito (institucion_id, producto);

-- =====================================================================
-- 4. LA BÓVEDA
--    Un documento es la identidad estable. Las versiones son
--    inmutables: nunca se sobrescriben ni se borran, porque hay que
--    poder demostrar qué archivo exacto recibió cada institución.
-- =====================================================================

create table documentos (
  id                uuid primary key default gen_random_uuid(),
  razon_social_id   uuid not null references razones_sociales(id) on delete cascade,
  tipo_documento_id uuid not null references tipos_documento(id) on delete restrict,
  nombre            text not null,
  folio             text,                        -- escritura, notario, número oficial
  -- referencia a la persona física cuando el documento es de un aval o accionista
  persona           text,
  notas             text,
  archivado         boolean not null default false,
  creado_en         timestamptz not null default now(),
  creado_por        uuid references perfiles(id)
);
create index on documentos (razon_social_id, tipo_documento_id);

create table documento_versiones (
  id              uuid primary key default gen_random_uuid(),
  documento_id    uuid not null references documentos(id) on delete cascade,
  version         integer not null,
  emitido_en      date not null,                 -- fecha del documento, NO de la carga
  ruta            text not null,                 -- ruta en el bucket privado
  sha256          text not null,                 -- integridad y detección de duplicados
  bytes           bigint not null,
  tipo_mime       text not null,
  antivirus       text not null default 'pendiente'
                    check (antivirus in ('pendiente','limpio','infectado','error')),
  subida_en       timestamptz not null default now(),
  subida_por      uuid references perfiles(id),
  unique (documento_id, version)
);
create index on documento_versiones (documento_id, version desc);

-- Versión utilizable de cada documento: la más reciente que YA pasó
-- revisión. Una carga pendiente de escanear no invalida la versión
-- anterior, que sigue siendo la buena hasta que la nueva se libere.
create view v_documento_actual as
select distinct on (dv.documento_id)
  dv.documento_id, dv.id as version_id, dv.version, dv.emitido_en,
  dv.ruta, dv.sha256, dv.antivirus,
  (current_date - dv.emitido_en) as antiguedad_dias
from documento_versiones dv
where dv.antivirus = 'limpio'
order by dv.documento_id, dv.version desc;

-- ¿Este documento sirve para esta institución, hoy?
-- Resuelve la regla específica del cliente, luego la global, y al
-- final la vigencia por omisión del tipo de documento.
create or replace function vigencia_para(p_documento uuid, p_institucion uuid, p_producto producto)
returns table (dias_maximos integer, antiguedad integer, dias_restantes integer, estado text)
language sql stable as $$
  with d as (
    select doc.id, doc.tipo_documento_id, doc.razon_social_id, a.antiguedad_dias
    from documentos doc
    join v_documento_actual a on a.documento_id = doc.id
    where doc.id = p_documento
  ),
  r as (
    select rv.dias_maximos
    from reglas_vigencia rv, d
    where rv.institucion_id = p_institucion
      and rv.tipo_documento_id = d.tipo_documento_id
      and (rv.producto is null or rv.producto = p_producto)
      and rv.vigente_desde <= current_date
      and (rv.vigente_hasta is null or rv.vigente_hasta >= current_date)
    order by rv.organizacion_id nulls last, rv.producto nulls last
    limit 1
  ),
  lim as (
    select coalesce((select dias_maximos from r),
                    (select td.vigencia_dias from tipos_documento td, d
                      where td.id = d.tipo_documento_id)) as dias
  )
  select lim.dias,
         d.antiguedad_dias,
         case when lim.dias is null then null else lim.dias - d.antiguedad_dias end,
         case
           when lim.dias is null then 'permanente'
           when lim.dias - d.antiguedad_dias < 0  then 'vencido'
           when lim.dias - d.antiguedad_dias <= 20 then 'por_vencer'
           else 'vigente'
         end
  from d, lim;
$$;

-- =====================================================================
-- 5. TRÁMITES
-- =====================================================================

create type etapa as enum
  ('prospeccion','integracion','mesa_credito','aprobado','contratado','declinado','cancelado');

create table tramites (
  id              uuid primary key default gen_random_uuid(),
  razon_social_id uuid not null references razones_sociales(id) on delete cascade,
  institucion_id  uuid not null references instituciones(id) on delete restrict,
  producto        producto not null,
  monto           numeric(16,2) not null check (monto >= 0),
  moneda          char(3) not null default 'MXN',
  plazo           text,
  destino         text,
  etapa           etapa not null default 'prospeccion',
  ejecutivo       text,
  correo_ejecutivo citext,
  abierto_en      date not null default current_date,
  cerrado_en      date,
  creado_por      uuid references perfiles(id)
);
create index on tramites (razon_social_id, etapa);

create table requisitos (
  id                uuid primary key default gen_random_uuid(),
  tramite_id        uuid not null references tramites(id) on delete cascade,
  tipo_documento_id uuid references tipos_documento(id) on delete restrict,
  nombre            text not null,
  obligatorio       boolean not null default true,
  -- documento de la bóveda que lo cubre; null si es propio del trámite
  documento_id      uuid references documentos(id) on delete set null,
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente','cubierto','observado','no_aplica')),
  observacion       text,
  actualizado_en    timestamptz not null default now()
);
create index on requisitos (tramite_id);
create index on requisitos (documento_id);

-- Avance real: un requisito cubierto por un documento vencido PARA ESA
-- institución deja de contar. Es la diferencia entre creer que vas al
-- 100% y que el analista te rechace el expediente.
create or replace function avance_tramite(p_tramite uuid)
returns table (total integer, cubiertos integer, caducos integer, porcentaje integer)
language sql stable as $$
  with t as (select institucion_id, producto from tramites where id = p_tramite),
  r as (
    select req.id, req.estado, req.documento_id,
           case when req.documento_id is null then 'permanente'
                else (select v.estado from vigencia_para(req.documento_id, t.institucion_id, t.producto) v)
           end as vig
    from requisitos req, t
    where req.tramite_id = p_tramite
  )
  select count(*)::int,
         count(*) filter (where estado='cubierto' and vig <> 'vencido')::int,
         count(*) filter (where estado='cubierto' and vig  = 'vencido')::int,
         case when count(*)=0 then 0 else
           (count(*) filter (where estado='cubierto' and vig <> 'vencido') * 100 / count(*))::int end
  from r;
$$;

-- =====================================================================
-- 6. ENVÍOS
--    Nunca se manda un archivo adjunto. Se manda una liga firmada con
--    caducidad, y queda registro de quién la abrió. El envío sella la
--    versión exacta que se entregó.
-- =====================================================================

create table envios (
  id              uuid primary key default gen_random_uuid(),
  razon_social_id uuid not null references razones_sociales(id) on delete cascade,
  tramite_id      uuid references tramites(id) on delete set null,
  titulo          text not null,
  destinatario    text not null,
  correo          citext not null,
  -- nunca se guarda el token en claro
  token_hash      text not null unique,
  expira_en       timestamptz not null,
  revocado_en     timestamptz,
  marca_agua      text not null,                 -- texto impreso en cada página
  mensaje         text,                          -- nota del remitente al ejecutivo
  correo_enviado_en timestamptz,                 -- null = la liga se copió a mano
  correo_error    text,                          -- por qué falló, si falló
  creado_en       timestamptz not null default now(),
  creado_por      uuid references perfiles(id)
);
create index on envios (razon_social_id, creado_en desc);

create table envio_items (
  envio_id    uuid not null references envios(id) on delete cascade,
  version_id  uuid not null references documento_versiones(id) on delete restrict,
  etiqueta    text not null,
  primary key (envio_id, version_id)
);

create table envio_accesos (
  id          bigserial primary key,
  envio_id    uuid not null references envios(id) on delete cascade,
  version_id  uuid references documento_versiones(id) on delete set null,
  accion      text not null check (accion in ('abrio','descargo','rechazado_expirado','rechazado_revocado')),
  ip          inet,
  agente      text,
  ocurrio_en  timestamptz not null default now()
);
create index on envio_accesos (envio_id, ocurrio_en desc);

-- =====================================================================
-- 7. DESPUÉS DE LA FIRMA
--    Es el módulo que evita que cancelen la suscripción cuando cierra
--    el crédito.
-- =====================================================================

create table contratos (
  id              uuid primary key default gen_random_uuid(),
  razon_social_id uuid not null references razones_sociales(id) on delete cascade,
  tramite_id      uuid references tramites(id) on delete set null,
  institucion_id  uuid not null references instituciones(id) on delete restrict,
  producto        producto not null,
  monto           numeric(16,2) not null,
  saldo           numeric(16,2) not null default 0,
  tasa            text,
  garantia        text,
  firmado_en      date not null,
  vence_en        date,
  estado          text not null default 'vigente'
                    check (estado in ('vigente','liquidado','vencido','reestructurado'))
);
create index on contratos (razon_social_id, estado);

create table obligaciones (
  id              uuid primary key default gen_random_uuid(),
  razon_social_id uuid not null references razones_sociales(id) on delete cascade,
  contrato_id     uuid not null references contratos(id) on delete cascade,
  descripcion     text not null,
  tipo            text not null check (tipo in ('entrega','financiera','administrativa')),
  periodicidad    text check (periodicidad in ('mensual','trimestral','semestral','anual','unica')),
  proxima_fecha   date not null,
  responsable_id  uuid references perfiles(id),
  estado          text not null default 'pendiente'
                    check (estado in ('pendiente','cumplida','vencida','dispensada')),
  cumplida_en     date,
  evidencia_id    uuid references documento_versiones(id) on delete set null
);
create index on obligaciones (razon_social_id, estado, proxima_fecha);

-- =====================================================================
-- 8. BITÁCORA
--    Append-only. No hay update ni delete, ni siquiera para el
--    propietario de la cuenta. Es lo que se le enseña a un auditor.
-- =====================================================================

create table bitacora (
  id              bigserial primary key,
  razon_social_id uuid references razones_sociales(id) on delete set null,
  perfil_id       uuid references perfiles(id) on delete set null,
  accion          text not null,
  entidad         text not null,
  entidad_id      uuid,
  detalle         jsonb,
  ip              inet,
  ocurrio_en      timestamptz not null default now()
);
create index on bitacora (razon_social_id, ocurrio_en desc);

create or replace function registrar()
returns trigger language plpgsql security definer set search_path = public as $$
declare rs uuid;
begin
  rs := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'razon_social_id')::uuid,
    (select razon_social_id from documentos
      where id = (to_jsonb(coalesce(new, old)) ->> 'documento_id')::uuid));
  insert into bitacora (razon_social_id, perfil_id, accion, entidad, entidad_id, detalle)
  values (rs, auth.uid(), lower(tg_op), tg_table_name,
          (to_jsonb(coalesce(new, old)) ->> 'id')::uuid,
          case when tg_op = 'UPDATE'
               then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               else to_jsonb(coalesce(new, old)) end);
  return coalesce(new, old);
end $$;

create trigger t_bit_doc     after insert or update or delete on documentos          for each row execute function registrar();
create trigger t_bit_ver     after insert                     on documento_versiones for each row execute function registrar();
create trigger t_bit_tramite after insert or update or delete on tramites            for each row execute function registrar();
create trigger t_bit_req     after update                     on requisitos          for each row execute function registrar();
create trigger t_bit_envio   after insert or update           on envios              for each row execute function registrar();
create trigger t_bit_contr   after insert or update or delete on contratos           for each row execute function registrar();

-- =====================================================================
-- 9. SEGURIDAD A NIVEL DE RENGLÓN
--    A partir de aquí, la base de datos no confía en la aplicación.
-- =====================================================================

alter table organizaciones       enable row level security;
alter table razones_sociales     enable row level security;
alter table perfiles             enable row level security;
alter table membresias           enable row level security;
alter table instituciones        enable row level security;
alter table tipos_documento      enable row level security;
alter table reglas_vigencia      enable row level security;
alter table plantillas_requisito enable row level security;
alter table documentos           enable row level security;
alter table documento_versiones  enable row level security;
alter table tramites             enable row level security;
alter table requisitos           enable row level security;
alter table envios               enable row level security;
alter table envio_items          enable row level security;
alter table envio_accesos        enable row level security;
alter table contratos            enable row level security;
alter table obligaciones         enable row level security;
alter table bitacora             enable row level security;

-- Perfiles: cada quien el suyo.
create policy p_perfil_lee    on perfiles for select using (id = auth.uid());
create policy p_perfil_edita  on perfiles for update using (id = auth.uid());

-- Organizaciones y membresías.
create policy p_org_lee on organizaciones for select
  using (exists (select 1 from membresias m where m.organizacion_id = id and m.perfil_id = auth.uid()));
create policy p_memb_lee on membresias for select
  using (perfil_id = auth.uid() or es_admin(organizacion_id));
create policy p_memb_admin on membresias for all
  using (es_admin(organizacion_id)) with check (es_admin(organizacion_id));

create policy p_rs_lee on razones_sociales for select using (id in (select rs_visibles()));
create policy p_rs_edita on razones_sociales for all
  using (es_admin(organizacion_id)) with check (es_admin(organizacion_id));

-- Catálogos: se ve lo global más lo propio; solo administradores escriben lo propio.
create policy p_inst_lee on instituciones for select
  using (organizacion_id is null
         or exists (select 1 from membresias m where m.organizacion_id = instituciones.organizacion_id and m.perfil_id = auth.uid()));
create policy p_inst_edita on instituciones for all
  using (organizacion_id is not null and es_admin(organizacion_id))
  with check (organizacion_id is not null and es_admin(organizacion_id));

create policy p_td_lee on tipos_documento for select
  using (organizacion_id is null
         or exists (select 1 from membresias m where m.organizacion_id = tipos_documento.organizacion_id and m.perfil_id = auth.uid()));
create policy p_td_edita on tipos_documento for all
  using (organizacion_id is not null and es_admin(organizacion_id))
  with check (organizacion_id is not null and es_admin(organizacion_id));

create policy p_rv_lee on reglas_vigencia for select
  using (organizacion_id is null
         or exists (select 1 from membresias m where m.organizacion_id = reglas_vigencia.organizacion_id and m.perfil_id = auth.uid()));
create policy p_rv_edita on reglas_vigencia for all
  using (organizacion_id is not null and es_admin(organizacion_id))
  with check (organizacion_id is not null and es_admin(organizacion_id));

create policy p_pr_lee on plantillas_requisito for select
  using (organizacion_id is null
         or exists (select 1 from membresias m where m.organizacion_id = plantillas_requisito.organizacion_id and m.perfil_id = auth.uid()));
create policy p_pr_edita on plantillas_requisito for all
  using (organizacion_id is not null and es_admin(organizacion_id))
  with check (organizacion_id is not null and es_admin(organizacion_id));

-- Datos del inquilino: leer si la razón social es visible, escribir si es editable.
create policy p_doc_lee   on documentos for select using (razon_social_id in (select rs_visibles()));
create policy p_doc_esc   on documentos for all
  using (razon_social_id in (select rs_editables()))
  with check (razon_social_id in (select rs_editables()));

create policy p_ver_lee on documento_versiones for select
  using (exists (select 1 from documentos d where d.id = documento_id and d.razon_social_id in (select rs_visibles())));
-- Las versiones se insertan pero NUNCA se actualizan ni se borran.
create policy p_ver_ins on documento_versiones for insert
  with check (exists (select 1 from documentos d where d.id = documento_id and d.razon_social_id in (select rs_editables())));

create policy p_tra_lee on tramites for select using (razon_social_id in (select rs_visibles()));
create policy p_tra_esc on tramites for all
  using (razon_social_id in (select rs_editables()))
  with check (razon_social_id in (select rs_editables()));

create policy p_req_lee on requisitos for select
  using (exists (select 1 from tramites t where t.id = tramite_id and t.razon_social_id in (select rs_visibles())));
create policy p_req_esc on requisitos for all
  using (exists (select 1 from tramites t where t.id = tramite_id and t.razon_social_id in (select rs_editables())))
  with check (exists (select 1 from tramites t where t.id = tramite_id and t.razon_social_id in (select rs_editables())));

create policy p_env_lee on envios for select using (razon_social_id in (select rs_visibles()));
create policy p_env_esc on envios for all
  using (razon_social_id in (select rs_editables()))
  with check (razon_social_id in (select rs_editables()));

create policy p_ei_lee on envio_items for select
  using (exists (select 1 from envios e where e.id = envio_id and e.razon_social_id in (select rs_visibles())));
create policy p_ei_esc on envio_items for insert
  with check (exists (select 1 from envios e where e.id = envio_id and e.razon_social_id in (select rs_editables())));

create policy p_ea_lee on envio_accesos for select
  using (exists (select 1 from envios e where e.id = envio_id and e.razon_social_id in (select rs_visibles())));

create policy p_con_lee on contratos for select using (razon_social_id in (select rs_visibles()));
create policy p_con_esc on contratos for all
  using (razon_social_id in (select rs_editables()))
  with check (razon_social_id in (select rs_editables()));

create policy p_obl_lee on obligaciones for select using (razon_social_id in (select rs_visibles()));
create policy p_obl_esc on obligaciones for all
  using (razon_social_id in (select rs_editables()))
  with check (razon_social_id in (select rs_editables()));

-- Bitácora: se lee, no se toca. No hay política de insert porque solo
-- escriben los triggers, que corren con SECURITY DEFINER.
create policy p_bit_lee on bitacora for select using (razon_social_id in (select rs_visibles()));

-- Cinturón y tirantes. Lo anterior ya impide modificar la bitácora y las
-- versiones, pero depende de que RLS siga encendido. Estos permisos se
-- revocan a nivel de tabla, así que la protección sobrevive incluso a un
-- 'disable row level security' hecho por error.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update, delete on bitacora from %I', r);
      execute format('revoke update, delete on documento_versiones from %I', r);
      execute format('revoke update, delete on envio_accesos from %I', r);
      execute format('revoke insert, update, delete on bitacora from %I', r);
    end if;
  end loop;
end $$;

-- =====================================================================
-- 10. ARCHIVOS
--     Bucket privado. La ruta empieza con el uuid de la razón social,
--     y la política compara ese primer segmento contra las razones
--     sociales visibles del usuario. Sin ruta válida no hay archivo.
--     Ruta: {razon_social_id}/{documento_id}/{version}.pdf
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos','documentos', false, 52428800,
        array['application/pdf','image/jpeg','image/png',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy s_doc_lee on storage.objects for select
  using (bucket_id = 'documentos'
         and ((storage.foldername(name))[1])::uuid in (select rs_visibles()));

create policy s_doc_sube on storage.objects for insert
  with check (bucket_id = 'documentos'
              and ((storage.foldername(name))[1])::uuid in (select rs_editables()));

-- Sin políticas de update ni delete: los archivos son inmutables.

-- =====================================================================
-- 11. SEMILLA MÍNIMA DE CATÁLOGOS GLOBALES
--     Reemplaza estas reglas con las que valides con cada institución.
--     Las de aquí son puntos de partida, no verdades.
-- =====================================================================

insert into tipos_documento (clave, nombre, categoria, vigencia_dias, contiene_datos_personales) values
  ('acta',      'Acta constitutiva',                    'corporativo', null, false),
  ('poderes',   'Poderes del representante legal',      'corporativo', 1095, true),
  ('accionaria','Estructura accionaria',                'corporativo', null, true),
  ('csf',       'Constancia de situación fiscal',       'fiscal',        90, false),
  ('op32d',     'Opinión de cumplimiento SAT (32-D)',   'fiscal',        30, false),
  ('anual',     'Declaración anual',                    'fiscal',      null, false),
  ('eeffdic',   'Estados financieros dictaminados',     'financiero',  null, false),
  ('eeffint',   'Estados financieros internos',         'financiero',   120, false),
  ('balanza',   'Balanza de comprobación',              'financiero',    45, false),
  ('edoscta',   'Estados de cuenta bancarios',          'financiero',    90, false),
  ('relacion',  'Relación de clientes y proveedores',   'financiero',    90, true),
  ('domicilio', 'Comprobante de domicilio',             'domicilio',     90, true),
  ('inerep',    'Identificación del representante legal','personas',    2200, true),
  ('ineaval',   'Identificación del aval',              'personas',    1600, true),
  ('buroaval',  'Autorización de buró de crédito',      'personas',     180, true),
  ('escritura', 'Escritura del inmueble en garantía',   'garantias',   null, false),
  ('gravamen',  'Certificado de libertad de gravamen',  'garantias',     90, false),
  ('avaluo',    'Avalúo del inmueble',                  'garantias',    365, false),
  ('poliza',    'Póliza de seguro de la garantía',      'garantias',    365, false)
on conflict do nothing;

insert into instituciones (nombre, tipo) values
  ('Banorte','banco'), ('BBVA México','banco'), ('Banco Mifel','banco'),
  ('HSBC México','banco'), ('Intercam','banco'),
  ('Afirme Arrendamiento','arrendadora'), ('Bancomext','banca_desarrollo')
on conflict do nothing;

-- Ejemplo de reglas. Documenta SIEMPRE la fuente: sin ella, en seis
-- meses nadie va a saber si el número sigue siendo cierto.
insert into reglas_vigencia (institucion_id, tipo_documento_id, dias_maximos, fuente)
select i.id, t.id, r.dias, 'pendiente de validar con el ejecutivo'
from (values
  ('Banorte','edoscta',180), ('Banorte','eeffint',90),  ('Banorte','domicilio',90),
  ('BBVA México','edoscta',90), ('BBVA México','domicilio',60), ('BBVA México','csf',60),
  ('Banco Mifel','edoscta',180), ('Banco Mifel','relacion',60), ('Banco Mifel','csf',60),
  ('Afirme Arrendamiento','edoscta',90), ('Afirme Arrendamiento','eeffint',180),
  ('Bancomext','edoscta',180), ('Bancomext','avaluo',730),
  ('HSBC México','edoscta',90), ('HSBC México','balanza',30)
) as r(inst, clave, dias)
join instituciones i on i.nombre = r.inst and i.organizacion_id is null
join tipos_documento t on t.clave = r.clave and t.organizacion_id is null;

-- Qué pide cada institución. Igual que las reglas de vigencia: estas
-- son un punto de partida y hay que validarlas con cada ejecutivo.
insert into plantillas_requisito (institucion_id, producto, tipo_documento_id, nombre_libre, obligatorio, orden)
select i.id, p.producto::producto, td.id, null, true, p.orden
from (values
  -- crédito simple, expediente completo
  ('Banorte','credito_simple','acta',1),      ('Banorte','credito_simple','poderes',2),
  ('Banorte','credito_simple','inerep',3),    ('Banorte','credito_simple','csf',4),
  ('Banorte','credito_simple','op32d',5),     ('Banorte','credito_simple','domicilio',6),
  ('Banorte','credito_simple','eeffdic',7),   ('Banorte','credito_simple','eeffint',8),
  ('Banorte','credito_simple','anual',9),     ('Banorte','credito_simple','balanza',10),
  ('Banorte','credito_simple','edoscta',11),  ('Banorte','credito_simple','relacion',12),
  ('Banorte','credito_simple','ineaval',13),  ('Banorte','credito_simple','buroaval',14),
  -- revolvente, más ligero
  ('BBVA México','credito_revolvente','acta',1),      ('BBVA México','credito_revolvente','poderes',2),
  ('BBVA México','credito_revolvente','inerep',3),    ('BBVA México','credito_revolvente','csf',4),
  ('BBVA México','credito_revolvente','op32d',5),     ('BBVA México','credito_revolvente','domicilio',6),
  ('BBVA México','credito_revolvente','eeffint',7),   ('BBVA México','credito_revolvente','balanza',8),
  ('BBVA México','credito_revolvente','edoscta',9),
  -- factoraje
  ('Banco Mifel','factoraje','acta',1),        ('Banco Mifel','factoraje','poderes',2),
  ('Banco Mifel','factoraje','inerep',3),      ('Banco Mifel','factoraje','csf',4),
  ('Banco Mifel','factoraje','op32d',5),       ('Banco Mifel','factoraje','accionaria',6),
  ('Banco Mifel','factoraje','relacion',7),    ('Banco Mifel','factoraje','edoscta',8),
  ('Banco Mifel','factoraje','eeffint',9),
  -- arrendamiento
  ('Afirme Arrendamiento','arrendamiento_puro','acta',1),
  ('Afirme Arrendamiento','arrendamiento_puro','poderes',2),
  ('Afirme Arrendamiento','arrendamiento_puro','inerep',3),
  ('Afirme Arrendamiento','arrendamiento_puro','csf',4),
  ('Afirme Arrendamiento','arrendamiento_puro','op32d',5),
  ('Afirme Arrendamiento','arrendamiento_puro','domicilio',6),
  ('Afirme Arrendamiento','arrendamiento_puro','eeffint',7),
  ('Afirme Arrendamiento','arrendamiento_puro','edoscta',8),
  ('Afirme Arrendamiento','arrendamiento_puro','ineaval',9)
) as p(inst, producto, clave, orden)
join instituciones i    on i.nombre = p.inst  and i.organizacion_id  is null
join tipos_documento td on td.clave = p.clave and td.organizacion_id is null;

-- Requisitos que no salen de la bóveda porque se generan para cada solicitud.
insert into plantillas_requisito (institucion_id, producto, tipo_documento_id, nombre_libre, obligatorio, orden)
select i.id, p.producto::producto, null, p.nombre, true, p.orden
from (values
  ('Banorte','credito_simple','Solicitud de crédito firmada',20),
  ('Banorte','credito_simple','Proyección de flujo a 12 meses',21),
  ('Banorte','credito_simple','Carta de destino de los recursos',22),
  ('BBVA México','credito_revolvente','Solicitud de crédito firmada',20),
  ('Banco Mifel','factoraje','Contratos con los clientes a ceder',20),
  ('Banco Mifel','factoraje','Muestra de facturas y complementos de pago',21),
  ('Afirme Arrendamiento','arrendamiento_puro','Cotización del proveedor de los bienes',20)
) as p(inst, producto, nombre, orden)
join instituciones i on i.nombre = p.inst and i.organizacion_id is null;

-- =====================================================================
-- FIN
-- =====================================================================

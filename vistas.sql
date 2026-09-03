-- =====================================================================
-- FOLIO · vistas y operaciones que consume la aplicación
-- Se ejecuta DESPUÉS de esquema.sql
--
-- La lógica del producto vive aquí, no en el código de la aplicación.
-- Si mañana hay app móvil, integración o reporte, todos leen la misma
-- verdad y no hay dos implementaciones que se contradigan.
--
-- Todas las vistas llevan security_invoker: sin eso, una vista en
-- Postgres corre con los permisos de quien la creó y se salta la
-- seguridad a nivel de renglón. Es un error de configuración común y
-- caro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Estado de cada documento de la bóveda, con el veredicto MÁS ESTRICTO
-- entre las instituciones que hoy lo están pidiendo. Si ninguna lo pide,
-- se usa la vigencia por omisión del tipo de documento.
-- ---------------------------------------------------------------------
create or replace view v_documento_estado
with (security_invoker = true) as
select
  d.id                as documento_id,
  d.razon_social_id,
  d.nombre,
  d.folio,
  d.persona,
  td.clave,
  td.categoria,
  td.vigencia_dias    as vigencia_base,
  a.version_id,
  a.version,
  a.emitido_en,
  a.antiguedad_dias,
  a.antivirus,
  a.ruta,
  coalesce(peor.dias_maximos, td.vigencia_dias) as dias_maximos,
  coalesce(peor.dias_restantes,
           case when td.vigencia_dias is null then null
                else td.vigencia_dias - a.antiguedad_dias end) as dias_restantes,
  coalesce(peor.estado,
           case when a.documento_id is null then 'falta'
                when td.vigencia_dias is null then 'permanente'
                when td.vigencia_dias - a.antiguedad_dias < 0 then 'vencido'
                when td.vigencia_dias - a.antiguedad_dias <= 20 then 'por_vencer'
                else 'vigente' end) as estado,
  peor.institucion    as institucion_critica,
  (select count(distinct r.tramite_id) from requisitos r where r.documento_id = d.id) as tramites_ligados
from documentos d
join tipos_documento td on td.id = d.tipo_documento_id
left join v_documento_actual a on a.documento_id = d.id
left join lateral (
  select v.dias_maximos, v.dias_restantes, v.estado, i.nombre as institucion
  from requisitos r
  join tramites t on t.id = r.tramite_id
   and t.etapa not in ('contratado','declinado','cancelado')
  join instituciones i on i.id = t.institucion_id,
  lateral vigencia_para(d.id, t.institucion_id, t.producto) v
  where r.documento_id = d.id
  order by v.dias_restantes nulls last
  limit 1
) peor on true
where d.archivado = false;

-- ---------------------------------------------------------------------
-- Avance de cada trámite, ya descontando lo que venció.
-- ---------------------------------------------------------------------
create or replace view v_tramite_avance
with (security_invoker = true) as
select t.id as tramite_id, t.razon_social_id, a.total, a.cubiertos, a.caducos, a.porcentaje
from tramites t, lateral avance_tramite(t.id) a;

-- ---------------------------------------------------------------------
-- Cada requisito con el veredicto de SU institución. El mismo documento
-- puede salir vigente en un renglón y vencido en otro.
-- ---------------------------------------------------------------------
create or replace view v_requisito_estado
with (security_invoker = true) as
select
  r.id            as requisito_id,
  r.tramite_id,
  r.nombre,
  r.estado,
  r.obligatorio,
  r.observacion,
  r.documento_id,
  r.tipo_documento_id,
  t.institucion_id,
  i.nombre        as institucion,
  t.producto,
  d.nombre        as documento_nombre,
  a.version       as documento_version,
  a.version_id,
  v.dias_maximos,
  v.antiguedad,
  v.dias_restantes,
  coalesce(v.estado, case when r.documento_id is null then 'sin_documento' else 'permanente' end) as vigencia
from requisitos r
join tramites t      on t.id = r.tramite_id
join instituciones i on i.id = t.institucion_id
left join documentos d on d.id = r.documento_id
left join v_documento_actual a on a.documento_id = r.documento_id
left join lateral vigencia_para(r.documento_id, t.institucion_id, t.producto) v on true;

-- ---------------------------------------------------------------------
-- Todo lo que vence o se debe entregar, en un solo lugar. Alimenta la
-- franja del panel y los recordatorios por correo.
-- ---------------------------------------------------------------------
create or replace view v_agenda
with (security_invoker = true) as
select razon_social_id, 'documento' as clase, documento_id as origen_id,
       nombre as titulo, institucion_critica as detalle,
       (current_date + dias_restantes) as fecha, dias_restantes as dias, estado
from v_documento_estado
where dias_restantes is not null
union all
select o.razon_social_id, 'obligacion', o.id, o.descripcion, i.nombre,
       o.proxima_fecha, (o.proxima_fecha - current_date),
       case when o.proxima_fecha < current_date then 'vencido'
            when o.proxima_fecha - current_date <= 20 then 'por_vencer'
            else 'vigente' end
from obligaciones o
join contratos c    on c.id = o.contrato_id
join instituciones i on i.id = c.institucion_id
where o.estado = 'pendiente'
union all
select e.razon_social_id, 'envio', e.id, e.titulo, e.destinatario,
       e.expira_en::date, (e.expira_en::date - current_date),
       case when e.revocado_en is not null then 'vencido'
            when e.expira_en < now() then 'vencido' else 'vigente' end
from envios e;

-- =====================================================================
-- MOTOR DE LA BÓVEDA
-- Una sola fuente alimenta todos los trámites abiertos. No corre solo
-- al abrir el trámite: corre después de cada cambio.
-- =====================================================================

create or replace function sincronizar_boveda(p_rs uuid)
returns integer
language plpgsql security invoker as $$
declare
  n integer := 0;
  r record;
  doc_id uuid;
begin
  for r in
    select req.id, req.tipo_documento_id, t.institucion_id, t.producto
    from requisitos req
    join tramites t on t.id = req.tramite_id
    where t.razon_social_id = p_rs
      and t.etapa not in ('contratado','declinado','cancelado')
      and req.documento_id is null
      and req.tipo_documento_id is not null
      and req.estado = 'pendiente'
  loop
    -- de todos los documentos de ese tipo, el que más vida le quede
    -- para ESA institución
    select d.id into doc_id
    from documentos d
    join v_documento_actual a on a.documento_id = d.id,
    lateral vigencia_para(d.id, r.institucion_id, r.producto) v
    where d.razon_social_id = p_rs
      and d.tipo_documento_id = r.tipo_documento_id
      and d.archivado = false
      and a.antivirus = 'limpio'
      and v.estado <> 'vencido'
    order by v.dias_restantes desc nulls first
    limit 1;

    if doc_id is not null then
      update requisitos
         set documento_id = doc_id, estado = 'cubierto', actualizado_en = now()
       where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Abrir un trámite: instancia la plantilla de esa institución para ese
-- producto y jala de la bóveda todo lo que ya exista vigente.
create or replace function crear_tramite(
  p_rs uuid, p_institucion uuid, p_producto producto,
  p_monto numeric, p_destino text, p_plazo text default null)
returns uuid
language plpgsql security invoker as $$
declare
  nuevo uuid;
  org uuid;
begin
  select organizacion_id into org from razones_sociales where id = p_rs;

  insert into tramites (razon_social_id, institucion_id, producto, monto, destino, plazo, creado_por)
  values (p_rs, p_institucion, p_producto, p_monto, p_destino, p_plazo, auth.uid())
  returning id into nuevo;

  insert into requisitos (tramite_id, tipo_documento_id, nombre, obligatorio)
  select nuevo, pr.tipo_documento_id,
         coalesce(pr.nombre_libre, td.nombre),
         pr.obligatorio
  from plantillas_requisito pr
  left join tipos_documento td on td.id = pr.tipo_documento_id
  where pr.institucion_id = p_institucion
    and pr.producto = p_producto
    and (pr.organizacion_id is null or pr.organizacion_id = org)
  order by pr.orden;

  perform sincronizar_boveda(p_rs);
  return nuevo;
end $$;

-- Registrar una versión nueva de un documento. Nunca sobrescribe:
-- apila. Después vuelve a alimentar todos los trámites abiertos.
create or replace function registrar_version(
  p_documento uuid, p_emitido date, p_ruta text,
  p_sha text, p_bytes bigint, p_mime text)
returns integer
language plpgsql security invoker as $$
declare
  v integer;
  rs uuid;
begin
  select razon_social_id into rs from documentos where id = p_documento;
  if rs is null then raise exception 'documento inexistente o sin acceso'; end if;

  select coalesce(max(version),0) + 1 into v
  from documento_versiones where documento_id = p_documento;

  insert into documento_versiones
    (documento_id, version, emitido_en, ruta, sha256, bytes, tipo_mime, antivirus, subida_por)
  values (p_documento, v, p_emitido, p_ruta, p_sha, p_bytes, p_mime, 'pendiente', auth.uid());

  -- los requisitos que quedaron colgando de un documento vencido se
  -- vuelven a evaluar solos en la vista; aquí solo enlazamos faltantes
  perform sincronizar_boveda(rs);
  return v;
end $$;

-- Marcar una obligación como cumplida y programar la siguiente.
create or replace function cumplir_obligacion(p_obligacion uuid, p_evidencia uuid default null)
returns date
language plpgsql security invoker as $$
declare
  o record;
  siguiente date;
  salto interval;
begin
  select * into o from obligaciones where id = p_obligacion;
  if o.id is null then raise exception 'obligación inexistente o sin acceso'; end if;

  update obligaciones
     set estado = 'cumplida', cumplida_en = current_date, evidencia_id = p_evidencia
   where id = p_obligacion;

  salto := case o.periodicidad
             when 'mensual'    then interval '1 month'
             when 'trimestral' then interval '3 months'
             when 'semestral'  then interval '6 months'
             when 'anual'      then interval '1 year'
             else null end;

  if salto is null then return null; end if;

  siguiente := (greatest(o.proxima_fecha, current_date) + salto)::date;
  insert into obligaciones
    (razon_social_id, contrato_id, descripcion, tipo, periodicidad, proxima_fecha, responsable_id)
  values (o.razon_social_id, o.contrato_id, o.descripcion, o.tipo, o.periodicidad, siguiente, o.responsable_id);
  return siguiente;
end $$;

-- Avanzar de etapa. No deja pasar de integración si faltan requisitos:
-- es la regla que evita mandar expedientes incompletos.
create or replace function avanzar_tramite(p_tramite uuid)
returns etapa
language plpgsql security invoker as $$
declare
  t record; a record; nueva etapa;
begin
  select * into t from tramites where id = p_tramite;
  if t.id is null then raise exception 'trámite inexistente o sin acceso'; end if;
  select * into a from avance_tramite(p_tramite);

  nueva := case t.etapa
             when 'prospeccion'  then 'integracion'
             when 'integracion'  then 'mesa_credito'
             when 'mesa_credito' then 'aprobado'
             when 'aprobado'     then 'contratado'
             else t.etapa end::etapa;

  if nueva = t.etapa then raise exception 'el trámite ya está en su etapa final'; end if;

  if t.etapa <> 'prospeccion' and a.porcentaje < 100 then
    raise exception 'faltan % requisitos para avanzar', (a.total - a.cubiertos);
  end if;

  update tramites set etapa = nueva,
         cerrado_en = case when nueva = 'contratado' then current_date else null end
   where id = p_tramite;

  if nueva = 'contratado' then
    insert into contratos (razon_social_id, tramite_id, institucion_id, producto, monto, saldo, firmado_en)
    values (t.razon_social_id, t.id, t.institucion_id, t.producto, t.monto, t.monto, current_date);
  end if;
  return nueva;
end $$;

-- Cuando la revisión antivirus libera una versión, la bóveda vuelve a
-- alimentar los trámites abiertos. Sin esto, un documento renovado se
-- quedaba colgado esperando a que alguien lo enlazara a mano.
create or replace function tras_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.antivirus = 'limpio' and coalesce(old.antivirus,'') <> 'limpio' then
    perform sincronizar_boveda((select razon_social_id from documentos where id = new.documento_id));
  end if;
  return new;
end $$;

-- Se borra antes de crearlo porque este archivo se vuelve a ejecutar cada
-- vez que cambia una vista o una función, y 'create trigger' no tiene
-- 'or replace'. Sin esta línea la segunda corrida falla a la mitad.
drop trigger if exists t_revision on documento_versiones;
create trigger t_revision after update of antivirus on documento_versiones
  for each row execute function tras_revision();

-- =====================================================================
-- LIGAS DE ENVÍO
-- El token nunca se guarda en claro. Se entrega una sola vez a quien
-- crea el envío y se manda por correo; en la base queda solo su hash.
-- =====================================================================

create or replace function crear_envio(
  p_tramite uuid, p_destinatario text, p_correo text,
  p_dias integer, p_versiones uuid[], p_mensaje text default null)
returns table (envio_id uuid, token text)
language plpgsql security invoker as $$
declare
  t record; e uuid; tk text; vid uuid;
begin
  select * into t from tramites where id = p_tramite;
  if t.id is null then raise exception 'trámite inexistente o sin acceso'; end if;

  tk := encode(gen_random_bytes(32), 'hex');

  insert into envios (razon_social_id, tramite_id, titulo, destinatario, correo,
                      token_hash, expira_en, marca_agua, mensaje, creado_por)
  values (t.razon_social_id, p_tramite,
          (select nombre from instituciones where id = t.institucion_id) || ' · ' || etiqueta_producto(t.producto),
          p_destinatario, p_correo,
          encode(digest(tk, 'sha256'), 'hex'),
          now() + make_interval(days => p_dias),
          p_destinatario || ' · ' || p_correo || ' · ' || to_char(now(),'DD/MM/YYYY'),
          nullif(trim(coalesce(p_mensaje,'')), ''),
          auth.uid())
  returning id into e;

  foreach vid in array p_versiones loop
    insert into envio_items (envio_id, version_id, etiqueta)
    select e, vid, d.nombre || ' v' || dv.version
    from documento_versiones dv join documentos d on d.id = dv.documento_id
    where dv.id = vid;
  end loop;

  return query select e, tk;
end $$;

-- Validar una liga desde la página pública. Corre con SECURITY DEFINER
-- porque quien la abre no tiene sesión, y deja registro de cada intento,
-- incluidos los rechazados.
create or replace function abrir_envio(p_token text, p_ip inet default null, p_agente text default null)
returns table (envio_id uuid, titulo text, destinatario text, marca_agua text,
               expira_en timestamptz, items jsonb)
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select * into e from envios where token_hash = encode(digest(p_token,'sha256'),'hex');
  if e.id is null then return; end if;

  if e.revocado_en is not null then
    insert into envio_accesos (envio_id, accion, ip, agente) values (e.id,'rechazado_revocado',p_ip,p_agente);
    return;
  end if;
  if e.expira_en < now() then
    insert into envio_accesos (envio_id, accion, ip, agente) values (e.id,'rechazado_expirado',p_ip,p_agente);
    return;
  end if;

  insert into envio_accesos (envio_id, accion, ip, agente) values (e.id,'abrio',p_ip,p_agente);

  return query
  select e.id, e.titulo, e.destinatario, e.marca_agua, e.expira_en,
         coalesce(jsonb_agg(jsonb_build_object(
           'version_id', ei.version_id, 'etiqueta', ei.etiqueta, 'ruta', dv.ruta)
           order by ei.etiqueta), '[]'::jsonb)
  from envio_items ei join documento_versiones dv on dv.id = ei.version_id
  where ei.envio_id = e.id
  group by e.id, e.titulo, e.destinatario, e.marca_agua, e.expira_en;
end $$;

create or replace function registrar_descarga(p_token text, p_version uuid, p_ip inet default null, p_agente text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare e record; r text;
begin
  select * into e from envios where token_hash = encode(digest(p_token,'sha256'),'hex');
  if e.id is null or e.revocado_en is not null or e.expira_en < now() then return null; end if;

  select dv.ruta into r from envio_items ei join documento_versiones dv on dv.id = ei.version_id
  where ei.envio_id = e.id and ei.version_id = p_version;
  if r is null then return null; end if;

  insert into envio_accesos (envio_id, version_id, accion, ip, agente)
  values (e.id, p_version, 'descargo', p_ip, p_agente);
  return r;
end $$;

revoke execute on function abrir_envio(text, inet, text) from public;
revoke execute on function registrar_descarga(text, uuid, inet, text) from public;
-- solo el servidor de la aplicación las llama, nunca el navegador
do $$ begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    grant execute on function abrir_envio(text, inet, text) to service_role;
    grant execute on function registrar_descarga(text, uuid, inet, text) to service_role;
  end if;
end $$;

-- =====================================================================
-- PAQUETES
-- El zip que el usuario baja para mandarlo él por correo. La regla de
-- qué se puede meter vive aquí, no en la aplicación: una versión que no
-- pasó la revisión antivirus no sale de la bóveda por ningún camino, ni
-- por liga ni por adjunto.
--
-- El nombre del zip y el de cada archivo dentro se deciden también aquí,
-- porque son parte del registro: dentro de un año hay que poder abrir un
-- correo viejo y saber qué renglón de esta tabla lo generó.
-- =====================================================================

-- Los parámetros de salida se llaman id_paquete y nombre_zip, y no
-- paquete_id ni archivo, porque en PL/pgSQL un parámetro de salida es una
-- variable más: si se llamara igual que una columna de las tablas que esta
-- función toca, cada consulta de adentro quedaría ambigua.
create or replace function crear_paquete(
  p_rs uuid, p_destinatario text, p_versiones uuid[],
  p_correo text default null, p_organizacion text default null,
  p_motivo text default null, p_marca boolean default true)
returns table (id_paquete uuid, nombre_zip text)
language plpgsql security invoker as $$
declare
  p uuid; vid uuid; n integer := 0; ahora timestamp; zip text;
begin
  if nullif(trim(coalesce(p_destinatario, '')), '') is null then
    raise exception 'falta el nombre de quien va a recibir el paquete';
  end if;
  if coalesce(array_length(p_versiones, 1), 0) = 0 then
    raise exception 'no se eligió ningún documento';
  end if;

  -- Hora del centro de México, no la del servidor: el sello que se
  -- imprime y el que se registra tienen que ser el mismo, y el usuario
  -- lo va a comparar contra la hora del correo que mandó.
  ahora := now() at time zone 'America/Mexico_City';

  zip := 'folio-'
    || lower(regexp_replace(
         coalesce(nullif((select rs.rfc from razones_sociales rs where rs.id = p_rs), ''), 'expediente'),
         '[^A-Za-z0-9]', '', 'g'))
    || '-' || to_char(ahora, 'YYYYMMDD-HH24MI') || '.zip';

  insert into paquetes (razon_social_id, destinatario, organizacion, correo,
                        motivo, marca_agua, archivo, creado_por)
  values (p_rs,
          trim(p_destinatario),
          nullif(trim(coalesce(p_organizacion, '')), ''),
          nullif(trim(coalesce(p_correo, '')), ''),
          nullif(trim(coalesce(p_motivo, '')), ''),
          case when p_marca then
            trim(p_destinatario)
            || coalesce(' · ' || nullif(trim(coalesce(p_correo, '')), ''), '')
            || ' · ' || to_char(ahora, 'DD/MM/YYYY HH24:MI')
          end,
          zip, auth.uid())
  returning paquetes.id into p;

  foreach vid in array p_versiones loop
    n := n + 1;
    insert into paquete_items (paquete_id, version_id, etiqueta, archivo)
    select p, vid,
           d.nombre || ' v' || dv.version,
           lpad(n::text, 2, '0') || ' '
             || regexp_replace(d.nombre, '[^A-Za-z0-9áéíóúÁÉÍÓÚñÑ .,()-]', '-', 'g')
             || ' v' || dv.version || '.'
             || coalesce(nullif(lower(regexp_replace(dv.ruta, '^.*\.', '')), lower(dv.ruta)), 'pdf')
      from documento_versiones dv
      join documentos d on d.id = dv.documento_id
     where dv.id = vid
       and dv.antivirus = 'limpio'
       and d.razon_social_id = p_rs;
  end loop;

  -- Si algo se quedó fuera, el paquete completo se cae. Un zip al que le
  -- falta un documento y no lo dice es peor que ningún zip.
  if (select count(*) from paquete_items pi where pi.paquete_id = p)
     <> array_length(p_versiones, 1) then
    raise exception 'hay documentos sin revisión antivirus, o que no son de esta razón social';
  end if;

  return query select p, zip;
end $$;

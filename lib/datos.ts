import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServidor } from './supabase';

export * from './formato';

/* ------------------------------------------------------------- la sesión */

/** Devuelve la sesión y la razón social activa. Si no hay sesión, manda
 *  a la pantalla de acceso: ninguna página del sistema es pública. */
export async function contexto() {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/entrar');

  const { data: perfil } = await sb.from('perfiles').select('*').eq('id', user.id).single();

  const { data: empresas } = await sb
    .from('razones_sociales')
    .select('id, nombre, rfc, organizacion_id')
    .eq('activa', true)
    .order('nombre');

  if (!empresas?.length) {
    // Usuario autenticado pero sin membresía. Pasa cuando alguien se
    // invita y nadie le asignó empresa todavía.
    return { sb, user, perfil, empresas: [], rs: null };
  }

  const galletas = await cookies();
  const elegida = galletas.get('rs')?.value;
  const rs = empresas.find(e => e.id === elegida) ?? empresas[0];

  return { sb, user, perfil, empresas, rs };
}

/* ------------------------------------------------------------- consultas */

export async function documentos(sb: any, rsId: string) {
  const { data } = await sb.from('v_documento_estado')
    .select('*').eq('razon_social_id', rsId)
    .order('dias_restantes', { ascending: true, nullsFirst: false });
  return data ?? [];
}

export async function tramites(sb: any, rsId: string) {
  const { data } = await sb.from('tramites')
    .select('*, instituciones(nombre), v_tramite_avance!inner(total, cubiertos, caducos, porcentaje)')
    .eq('razon_social_id', rsId)
    .order('abierto_en', { ascending: false });
  return data ?? [];
}

export async function agenda(sb: any, rsId: string, dias = 90) {
  const { data } = await sb.from('v_agenda')
    .select('*').eq('razon_social_id', rsId)
    .lte('dias', dias).order('dias');
  return data ?? [];
}

export async function contratos(sb: any, rsId: string) {
  const { data } = await sb.from('contratos')
    .select('*, instituciones(nombre)')
    .eq('razon_social_id', rsId).order('firmado_en', { ascending: false });
  return data ?? [];
}

export async function obligaciones(sb: any, rsId: string) {
  const { data } = await sb.from('obligaciones')
    .select('*, contratos(id, institucion_id, instituciones(nombre))')
    .eq('razon_social_id', rsId).order('proxima_fecha');
  return data ?? [];
}

export async function envios(sb: any, rsId: string) {
  const { data } = await sb.from('envios')
    .select('*, tramites(producto, instituciones(nombre)), envio_items(version_id), envio_accesos(accion, ocurrio_en)')
    .eq('razon_social_id', rsId).order('creado_en', { ascending: false });
  return data ?? [];
}

export async function paquetes(sb: any, rsId: string) {
  const { data } = await sb.from('paquetes')
    .select('*, paquete_items(etiqueta), paquete_descargas(ocurrio_en, bytes)')
    .eq('razon_social_id', rsId).order('creado_en', { ascending: false });
  return data ?? [];
}

export async function instituciones(sb: any) {
  const { data } = await sb.from('instituciones')
    .select('id, nombre, tipo').eq('activa', true).order('nombre');
  return data ?? [];
}

export async function tiposDocumento(sb: any) {
  const { data } = await sb.from('tipos_documento')
    .select('id, clave, nombre, categoria, vigencia_dias')
    .eq('activo', true).order('nombre');
  return data ?? [];
}

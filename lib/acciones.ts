'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServidor } from './supabase';
import { enviarCorreo, correoEnvio } from './correo';
import { nombreProducto } from './formato';

/* Cada acción vuelve a pasar por las políticas de la base de datos. Aquí
   no se verifica a quién pertenece nada: eso ya lo hace Postgres, y es
   deliberado. Si el día de mañana alguien se equivoca en este archivo,
   la base sigue negando el acceso. */

export async function cambiarRazonSocial(id: string) {
  const galletas = await cookies();
  galletas.set('rs', id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}

export async function salir() {
  const sb = await supabaseServidor();
  await sb.auth.signOut();
  redirect('/entrar');
}

/* --------------------------------------------------------------- bóveda */

/** Crea el documento si no existía y registra la versión ya subida al
 *  almacén. La versión nace pendiente de revisión antivirus. */
export async function registrarDocumento(datos: {
  razonSocialId: string; tipoDocumentoId: string; nombre: string;
  folio?: string; emitido: string; ruta: string; sha256: string;
  bytes: number; mime: string; documentoId?: string;
}) {
  const sb = await supabaseServidor();
  let docId = datos.documentoId;

  if (!docId) {
    const { data, error } = await sb.from('documentos').insert({
      razon_social_id: datos.razonSocialId,
      tipo_documento_id: datos.tipoDocumentoId,
      nombre: datos.nombre,
      folio: datos.folio || null,
    }).select('id').single();
    if (error) return { error: error.message };
    docId = data.id;
  }

  const { data: version, error } = await sb.rpc('registrar_version', {
    p_documento: docId, p_emitido: datos.emitido, p_ruta: datos.ruta,
    p_sha: datos.sha256, p_bytes: datos.bytes, p_mime: datos.mime,
  });
  if (error) return { error: error.message };

  revalidatePath('/boveda');
  revalidatePath('/panel');
  return { ok: true, documentoId: docId, version };
}

export async function sincronizar(rsId: string) {
  const sb = await supabaseServidor();
  const { data, error } = await sb.rpc('sincronizar_boveda', { p_rs: rsId });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, resueltos: data ?? 0 };
}

/* -------------------------------------------------------------- trámites */

export async function abrirTramite(datos: {
  razonSocialId: string; institucionId: string; producto: string;
  monto: number; destino: string; plazo?: string;
}) {
  const sb = await supabaseServidor();
  const { data, error } = await sb.rpc('crear_tramite', {
    p_rs: datos.razonSocialId, p_institucion: datos.institucionId,
    p_producto: datos.producto, p_monto: datos.monto,
    p_destino: datos.destino, p_plazo: datos.plazo ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath('/tramites');
  return { ok: true, id: data as string };
}

export async function avanzarEtapa(tramiteId: string) {
  const sb = await supabaseServidor();
  const { data, error } = await sb.rpc('avanzar_tramite', { p_tramite: tramiteId });
  // Postgres es quien impide avanzar con requisitos faltantes; aquí solo
  // se traduce el mensaje.
  if (error) return { error: error.message.replace(/^.*?:\s*/, '') };
  revalidatePath('/tramites');
  return { ok: true, etapa: data };
}

export async function marcarRequisito(requisitoId: string, estado: string, observacion?: string) {
  const sb = await supabaseServidor();
  const { error } = await sb.from('requisitos')
    .update({ estado, observacion: observacion ?? null, actualizado_en: new Date().toISOString() })
    .eq('id', requisitoId);
  if (error) return { error: error.message };
  revalidatePath('/tramites');
  return { ok: true };
}

/* ---------------------------------------------------------------- envíos */

/** Crea la liga y, si se pidió, la manda por correo al ejecutivo.
 *  El token en claro existe solo dentro de esta función y en el correo:
 *  en la base queda únicamente su huella. Si el correo falla, se devuelve
 *  igual para que se pueda copiar a mano, porque el trabajo no se detiene
 *  porque un proveedor de correo esté caído. */
export async function crearEnvio(datos: {
  tramiteId: string; destinatario: string; correo: string;
  dias: number; versiones: string[]; mensaje?: string;
  mandarCorreo?: boolean; copiaA?: string;
}) {
  const sb = await supabaseServidor();

  const { data, error } = await sb.rpc('crear_envio', {
    p_tramite: datos.tramiteId, p_destinatario: datos.destinatario,
    p_correo: datos.correo, p_dias: datos.dias,
    p_versiones: datos.versiones, p_mensaje: datos.mensaje ?? null,
  });
  if (error) return { error: error.message };

  const fila = Array.isArray(data) ? data[0] : data;
  const liga = `${await urlBase()}/l/${fila.token}`;

  if (!datos.mandarCorreo) {
    revalidatePath('/envios');
    return { ok: true, envioId: fila.envio_id, token: fila.token, liga, correoEnviado: false };
  }

  // Datos para armar el mensaje. Se leen con la sesión del usuario, así
  // que si no tuviera acceso al trámite tampoco los vería aquí.
  const [{ data: t }, { data: { user } }] = await Promise.all([
    sb.from('tramites')
      .select('producto, instituciones(nombre), razones_sociales(nombre, rfc)')
      .eq('id', datos.tramiteId).single(),
    sb.auth.getUser(),
  ]);
  const { data: perfil } = await sb.from('perfiles')
    .select('nombre, correo').eq('id', user!.id).single();
  const { data: items } = await sb.from('envio_items')
    .select('etiqueta').eq('envio_id', fila.envio_id).order('etiqueta');

  const mensaje = correoEnvio({
    destinatario: datos.destinatario,
    institucion: (t as any)?.instituciones?.nombre ?? '',
    empresa: (t as any)?.razones_sociales?.nombre ?? '',
    rfc: (t as any)?.razones_sociales?.rfc ?? '',
    remitente: perfil?.nombre ?? 'El área de finanzas',
    correoRemitente: perfil?.correo ?? '',
    producto: nombreProducto((t as any)?.producto ?? ''),
    liga,
    expira: new Date(Date.now() + datos.dias * 86400000),
    documentos: (items ?? []).map((i: any) => i.etiqueta),
    mensaje: datos.mensaje,
  });

  const envio = await enviarCorreo({
    para: datos.correo,
    copiaA: datos.copiaA,
    responderA: perfil?.correo,
    asunto: mensaje.asunto,
    html: mensaje.html,
    texto: mensaje.texto,
  });

  await sb.from('envios').update(
    envio.ok
      ? { correo_enviado_en: new Date().toISOString(), correo_error: null }
      : { correo_error: envio.error ?? 'falló sin detalle' }
  ).eq('id', fila.envio_id);

  revalidatePath('/envios');
  return {
    ok: true, envioId: fila.envio_id, token: fila.token, liga,
    correoEnviado: envio.ok, errorCorreo: envio.error,
  };
}

/** La dirección pública del sistema. Se prefiere la variable de entorno
 *  porque detrás de un proxy la cabecera puede mentir, y esta URL termina
 *  dentro de un correo que sale hacia un banco. */
async function urlBase() {
  const fija = process.env.NEXT_PUBLIC_URL_BASE;
  if (fija) return fija.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const protocolo = host.startsWith('localhost') ? 'http' : 'https';
  return `${protocolo}://${host}`;
}

export async function revocarEnvio(envioId: string) {
  const sb = await supabaseServidor();
  const { error } = await sb.from('envios')
    .update({ revocado_en: new Date().toISOString() }).eq('id', envioId);
  if (error) return { error: error.message };
  revalidatePath('/envios');
  return { ok: true };
}

/* --------------------------------------------------------- obligaciones */

export async function cumplirObligacion(obligacionId: string) {
  const sb = await supabaseServidor();
  const { data, error } = await sb.rpc('cumplir_obligacion', { p_obligacion: obligacionId });
  if (error) return { error: error.message };
  revalidatePath('/contratos');
  revalidatePath('/panel');
  return { ok: true, siguiente: data as string | null };
}

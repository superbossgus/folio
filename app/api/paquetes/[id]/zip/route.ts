import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseServidor } from '@/lib/supabase';
import { marcarPdf } from '@/lib/marca';
import { fecha, fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Arma el zip a partir del renglón de `paquetes`. El registro ya existe
   antes de llegar aquí: esta ruta no decide nada, solo materializa lo que
   quedó sellado. Por eso se puede volver a llamar cuantas veces haga
   falta y siempre sale el mismo contenido, con las mismas versiones.

   Corre con la sesión del usuario, así que si alguien pega un id de otra
   empresa la base contesta que no existe. Aquí no se comprueba nada. */
export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await supabaseServidor();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse('Sesión vencida. Vuelve a entrar.', { status: 401 });

  const { data: paquete } = await sb.from('paquetes')
    .select(`id, destinatario, organizacion, correo, motivo, marca_agua, archivo, creado_en,
             razones_sociales (nombre, rfc),
             paquete_items (etiqueta, archivo,
               documento_versiones (version, emitido_en, ruta, sha256,
                 documentos (nombre, folio)))`)
    .eq('id', id).single();

  if (!paquete) return new NextResponse('Paquete no disponible.', { status: 404 });

  const p: any = paquete;
  const items = [...(p.paquete_items ?? [])]
    .sort((a: any, b: any) => a.archivo.localeCompare(b.archivo, 'es'));
  if (!items.length) return new NextResponse('El paquete no tiene documentos.', { status: 409 });

  const zip = new JSZip();
  const bajado = new Date().toISOString();

  for (const item of items) {
    const version = item.documento_versiones;
    const { data: archivo, error } = await sb.storage.from('documentos').download(version.ruta);
    if (error || !archivo) {
      return new NextResponse(
        `No se pudo leer «${item.etiqueta}» del almacén. No se arma un zip incompleto.`,
        { status: 502 });
    }

    let bytes: Uint8Array = new Uint8Array(await archivo.arrayBuffer());
    if (p.marca_agua && item.archivo.toLowerCase().endsWith('.pdf')) {
      bytes = await marcarPdf(bytes, p.marca_agua);
    }
    zip.file(item.archivo, Buffer.from(bytes));
  }

  zip.file('00 contenido.txt', manifiesto(p, items, bajado));

  // Los PDF ya vienen comprimidos; apretarlos otra vez cuesta tiempo y no
  // baja casi nada. Nivel bajo: el zip es un sobre, no un compresor.
  const paquete_zip = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 3 },
  });

  await sb.from('paquete_descargas').insert({
    paquete_id: p.id,
    perfil_id: user.id,
    bytes: paquete_zip.byteLength,
    ip: (peticion.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
  });

  const seguro = p.archivo.replace(/[^A-Za-z0-9._-]/g, '_');
  return new NextResponse(paquete_zip as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(paquete_zip.byteLength),
      'Content-Disposition':
        `attachment; filename="${seguro}"; filename*=UTF-8''${encodeURIComponent(p.archivo)}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/* La carátula del zip. Es lo que convierte un adjunto suelto en algo que
   se puede auditar: dice para quién se armó, a qué hora y con qué versión
   exacta de cada documento, con su huella para comprobar que nadie lo
   cambió en el camino. */
function manifiesto(p: any, items: any[], bajado: string) {
  const empresa = p.razones_sociales;
  const lineas = [
    'FOLIO · Paquete de documentos',
    '='.repeat(62),
    '',
    `Razón social:  ${empresa?.nombre ?? '—'}${empresa?.rfc ? `  ·  RFC ${empresa.rfc}` : ''}`,
    `Para:          ${p.destinatario}${p.organizacion ? `  ·  ${p.organizacion}` : ''}`,
    ...(p.correo ? [`Correo:        ${p.correo}`] : []),
    ...(p.motivo ? [`Motivo:        ${p.motivo}`] : []),
    `Armado el:     ${fechaHora(p.creado_en)} (hora del centro de México)`,
    `Descargado el: ${fechaHora(bajado)}`,
    `Marca de agua: ${p.marca_agua ?? 'sin marca'}`,
    '',
    `Contenido (${items.length} documento${items.length > 1 ? 's' : ''})`,
    '-'.repeat(62),
  ];

  items.forEach((item, i) => {
    const v = item.documento_versiones;
    const d = v?.documentos;
    lineas.push(
      `${i + 1}. ${item.etiqueta}`,
      `   archivo:  ${item.archivo}`,
      `   emitido:  ${fecha(v?.emitido_en)}${d?.folio ? `  ·  ${d.folio}` : ''}`,
      `   sha-256:  ${v?.sha256 ?? '—'}`,
      '');
  });

  lineas.push(
    '-'.repeat(62),
    'Las huellas sha-256 son las del archivo original, sin la marca de',
    'agua. Sirven para comprobar contra la bóveda que el documento es el',
    'mismo que se cargó y que nadie lo cambió en el camino.',
    '',
    'Este paquete quedó registrado en Folio: consta a quién se armó, qué',
    'llevaba y a qué hora.');

  return lineas.join('\r\n');
}

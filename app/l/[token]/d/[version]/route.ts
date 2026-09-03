import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { marcarPdf } from '@/lib/marca';

export const dynamic = 'force-dynamic';

/* La marca de agua se imprime en cada descarga; nunca se guarda una copia
   marcada. Así, si un documento aparece filtrado, el texto impreso dice a
   quién se le entregó y en qué fecha. */
export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ token: string; version: string }> }
) {
  const { token, version } = await params;
  const ip = (peticion.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const agente = peticion.headers.get('user-agent');

  const sb = supabaseAdmin();

  // La base valida el token, la caducidad y que esa versión pertenezca a
  // ese envío. Si algo falla, devuelve nulo y aquí no se sabe por qué.
  const { data: ruta } = await sb.rpc('registrar_descarga', {
    p_token: token, p_version: version, p_ip: ip, p_agente: agente,
  });
  if (!ruta) {
    return new NextResponse('Documento no disponible.', { status: 404 });
  }

  const { data: archivo, error } = await sb.storage.from('documentos').download(ruta as string);
  if (error || !archivo) {
    return new NextResponse('No se pudo leer el archivo.', { status: 502 });
  }

  // El texto de la marca viene de la misma función que validó la liga.
  const { data: datos } = await sb.rpc('abrir_envio', { p_token: token });
  const marca = (Array.isArray(datos) ? datos[0] : datos)?.marca_agua ?? 'Copia controlada';

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const esPdf = ruta.toString().toLowerCase().endsWith('.pdf');

  if (!esPdf) {
    // Imágenes y otros formatos se sirven tal cual; la trazabilidad queda
    // en la bitácora aunque no se pueda imprimir la marca encima.
    return new NextResponse(bytes as any, {
      headers: {
        'Content-Type': archivo.type || 'application/octet-stream',
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      },
    });
  }

  // Si el PDF viene cifrado o corrupto, marcarPdf devuelve el original:
  // la descarga no se cae y el acceso ya quedó registrado de todas formas.
  const marcado = await marcarPdf(bytes, marca);
  return new NextResponse(marcado as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

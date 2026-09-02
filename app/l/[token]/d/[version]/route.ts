import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { supabaseAdmin } from '@/lib/supabase';

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

  try {
    const pdf = await PDFDocument.load(bytes);
    const tipografia = await pdf.embedFont(StandardFonts.Helvetica);

    for (const pagina of pdf.getPages()) {
      const { width, height } = pagina.getSize();
      pagina.drawText(marca, {
        x: width * 0.08,
        y: height * 0.25,
        size: Math.max(14, Math.min(26, width / 22)),
        font: tipografia,
        color: rgb(0.55, 0.6, 0.63),
        opacity: 0.28,
        rotate: degrees(32),
      });
      pagina.drawText(marca, {
        x: 28, y: 18, size: 7, font: tipografia,
        color: rgb(0.42, 0.47, 0.5), opacity: 0.75,
      });
    }

    const marcado = await pdf.save();
    return new NextResponse(marcado as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch {
    // Un PDF cifrado o corrupto no debe tumbar la descarga: se entrega
    // sin marca, pero el acceso ya quedó registrado.
    return new NextResponse(bytes as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store, private',
      },
    });
  }
}

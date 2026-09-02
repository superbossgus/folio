import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* Lo llama el servicio de revisión cuando termina de escanear un archivo.
   Al marcar una versión como limpia, un disparador en la base vuelve a
   alimentar todos los trámites abiertos: es el momento en que un documento
   recién cargado empieza a contar. */
export async function POST(peticion: NextRequest) {
  const secreto = process.env.WEBHOOK_ANTIVIRUS_SECRET;
  if (!secreto || peticion.headers.get('x-folio-secreto') !== secreto) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  const { versionId, resultado } = await peticion.json();
  if (!versionId || !['limpio', 'infectado', 'error'].includes(resultado)) {
    return NextResponse.json({ error: 'petición inválida' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from('documento_versiones')
    .update({ antivirus: resultado }).eq('id', versionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

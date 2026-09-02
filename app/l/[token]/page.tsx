import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* Única página del sistema sin sesión. Quien la abre es el analista del
   banco, que no tiene cuenta ni debe tenerla. La validación del token, la
   caducidad y el registro del acceso ocurren en la base de datos. */
export default async function Liga({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cabeceras = await headers();
  const ip = (cabeceras.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const agente = cabeceras.get('user-agent');

  const sb = supabaseAdmin();
  const { data } = await sb.rpc('abrir_envio', {
    p_token: token, p_ip: ip, p_agente: agente,
  });
  const envio = Array.isArray(data) ? data[0] : data;

  if (!envio) {
    return (
      <div className="acceso">
        <div className="caja">
          <h1>Liga no disponible</h1>
          <p style={{ marginBottom: 0 }}>
            Esta liga caducó, fue revocada o no existe. Pídele al remitente
            que genere una nueva.
          </p>
        </div>
      </div>
    );
  }

  const items = (envio.items ?? []) as any[];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 18px' }}>
      <div className="brand" style={{ padding: 0, marginBottom: 20 }}>
        <b style={{ color: 'var(--ink)', fontSize: 20 }}>Folio</b>
      </div>

      <h1>{envio.titulo}</h1>
      <p className="sub">
        Documentación para {envio.destinatario}. La liga expira el{' '}
        {new Date(envio.expira_en).toLocaleDateString('es-MX')}.
      </p>

      <div className="note">
        Cada archivo lleva impresa la marca <b>{envio.marca_agua}</b> y se
        registra quién lo descarga. No lo reenvíes: pide otra liga.
      </div>

      <div className="rows">
        <div className="row head" style={{ gridTemplateColumns: '1fr auto' }}>
          <span>Documento</span><span>Descargar</span>
        </div>
        {items.map((i: any) => (
          <div className="row" style={{ gridTemplateColumns: '1fr auto' }} key={i.version_id}>
            <div className="name">{i.etiqueta}</div>
            <span className="act">
              <a className="btn sm" href={`/l/${token}/d/${i.version_id}`}>Abrir</a>
            </span>
          </div>
        ))}
      </div>

      <p className="tiny muted" style={{ marginTop: 20 }}>
        Si algún documento está incompleto o vencido, avísale al remitente en
        lugar de pedirlo por correo. Así queda en el expediente.
      </p>
    </div>
  );
}

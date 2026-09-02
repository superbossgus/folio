import 'server-only';

/* Un solo lugar que manda correo. Se usa fetch directo contra la API en
   lugar de un SDK: es una llamada HTTP, no vale la pena una dependencia
   más en algo que toca datos de clientes. */

const API = 'https://api.resend.com/emails';

type Correo = {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  responderA?: string;
  copiaA?: string;
};

export async function enviarCorreo(c: Correo): Promise<{ ok: boolean; error?: string }> {
  const llave = process.env.RESEND_API_KEY;
  const remitente = process.env.CORREO_REMITENTE;

  if (!llave || !remitente) {
    // Sin configurar, el sistema sigue sirviendo: la liga se copia a mano.
    return { ok: false, error: 'El envío de correo no está configurado en este servidor.' };
  }

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remitente,
        to: [c.para],
        cc: c.copiaA ? [c.copiaA] : undefined,
        reply_to: c.responderA,
        subject: c.asunto,
        html: c.html,
        text: c.texto,
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      return { ok: false, error: `El proveedor de correo rechazó el mensaje (${r.status}). ${detalle.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: 'No se pudo contactar al proveedor de correo: ' + (e?.message ?? '') };
  }
}

/* ------------------------------------------------------------ plantilla */

const escapar = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function correoEnvio(d: {
  destinatario: string;
  institucion: string;
  empresa: string;
  rfc: string;
  remitente: string;
  correoRemitente: string;
  producto: string;
  liga: string;
  expira: Date;
  documentos: string[];
  mensaje?: string;
}) {
  const vence = d.expira.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const dias = Math.max(1, Math.ceil((+d.expira - Date.now()) / 86400000));

  const asunto = `${d.empresa} · documentación para ${d.producto}`;

  const texto = [
    `${d.destinatario},`,
    '',
    `${d.remitente}, de ${d.empresa} (RFC ${d.rfc}), le comparte la documentación`,
    `para el trámite de ${d.producto}.`,
    ...(d.mensaje ? ['', d.mensaje] : []),
    '',
    `Consultarla aquí: ${d.liga}`,
    '',
    `La liga expira el ${vence} (${dias} días). Incluye ${d.documentos.length} documentos:`,
    ...d.documentos.map((n) => `  · ${n}`),
    '',
    'Cada archivo lleva impreso su nombre y correo, y queda registro de las',
    'descargas. Si necesita algo adicional o algún documento viene incompleto,',
    'responda a este correo para que quede en el expediente.',
    '',
    `${d.remitente} · ${d.correoRemitente}`,
    d.empresa,
  ].join('\n');

  // Tablas y estilos en línea: los clientes de correo corporativos, que es
  // donde esto se va a abrir, siguen sin soportar CSS moderno.
  const html = `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#E9ECEE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9ECEE;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D3DAE0;border-radius:4px;font-family:Helvetica,Arial,sans-serif;color:#16232B;">

  <tr><td style="padding:20px 24px 0;">
    <div style="font-size:19px;font-weight:bold;letter-spacing:-.02em;">Folio</div>
  </td></tr>

  <tr><td style="padding:18px 24px 0;">
    <div style="font-size:19px;font-weight:bold;line-height:1.3;">${escapar(d.empresa)}</div>
    <div style="font-size:13px;color:#5A6B75;margin-top:3px;">
      RFC ${escapar(d.rfc)} · ${escapar(d.producto)} · ${escapar(d.institucion)}
    </div>
  </td></tr>

  <tr><td style="padding:18px 24px 0;font-size:14px;line-height:1.5;">
    <p style="margin:0 0 12px;">${escapar(d.destinatario)},</p>
    <p style="margin:0 0 12px;">
      ${escapar(d.remitente)} le comparte la documentación del trámite.
    </p>
    ${d.mensaje ? `<p style="margin:0 0 12px;padding:11px 13px;background:#E0EDEF;border:1px solid #C4DDE1;border-radius:4px;font-size:13px;">${escapar(d.mensaje)}</p>` : ''}
  </td></tr>

  <tr><td style="padding:8px 24px 0;">
    <a href="${escapar(d.liga)}" style="display:inline-block;background:#0E4D5C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:bold;padding:11px 20px;border-radius:4px;">
      Ver la documentación
    </a>
    <div style="font-size:12px;color:#5A6B75;margin-top:10px;">
      La liga expira el ${escapar(vence)}, en ${dias} días.
    </div>
  </td></tr>

  <tr><td style="padding:20px 24px 0;">
    <div style="font-size:12px;font-weight:bold;color:#5A6B75;margin-bottom:6px;">
      ${d.documentos.length} documentos incluidos
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7EBEE;border-radius:4px;">
      ${d.documentos
        .map(
          (n, i) =>
            `<tr><td style="padding:8px 12px;font-size:13px;${i ? 'border-top:1px solid #E7EBEE;' : ''}">${escapar(n)}</td></tr>`
        )
        .join('')}
    </table>
  </td></tr>

  <tr><td style="padding:18px 24px 0;">
    <div style="font-size:12px;color:#5A6B75;line-height:1.5;padding:11px 13px;background:#F5F7F8;border-radius:4px;">
      Cada archivo lleva impreso su nombre y correo, y queda registro de las
      descargas. Si algún documento viene incompleto o necesita algo adicional,
      responda a este correo para que quede en el expediente.
    </div>
  </td></tr>

  <tr><td style="padding:18px 24px 22px;border-top:1px solid #E7EBEE;margin-top:18px;">
    <div style="font-size:13px;font-weight:bold;">${escapar(d.remitente)}</div>
    <div style="font-size:12px;color:#5A6B75;">
      ${escapar(d.correoRemitente)} · ${escapar(d.empresa)}
    </div>
  </td></tr>

</table>
<div style="max-width:560px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#8A97A0;padding:12px 4px;text-align:left;">
  Este mensaje contiene una liga temporal, no archivos adjuntos. Si no
  esperaba recibirlo, ignórelo: la liga caduca sola.
</div>
</td></tr></table>
</body></html>`;

  return { asunto, html, texto };
}

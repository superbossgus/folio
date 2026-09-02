'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { crearEnvio } from '@/lib/acciones';

export default function NuevoEnvio(
  { tramiteId, requisitos, institucion }:
  { tramiteId: string; requisitos: any[]; institucion: string }
) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<any>(null);

  const [destinatario, setDestinatario] = useState('');
  const [correo, setCorreo] = useState('');
  const [copiaA, setCopiaA] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [dias, setDias] = useState('7');
  const [mandarCorreo, setMandarCorreo] = useState(true);

  // Un requisito puede repetir documento; se manda una versión de cada uno.
  const disponibles = requisitos.filter(
    (r, i, todos) => todos.findIndex(x => x.documento_id === r.documento_id) === i);
  const [elegidos, setElegidos] = useState<string[]>(
    disponibles.map(r => r.documento_id));

  if (!abierto) {
    return (
      <button className="btn pri" disabled={!disponibles.length}
              onClick={() => setAbierto(true)}>
        Preparar envío
      </button>
    );
  }

  /* Pantalla posterior al envío. La liga se muestra siempre, haya salido
     el correo o no: si el proveedor falla, el trabajo no se detiene. */
  if (resultado) {
    return (
      <div className="scrim">
        <div className="modal">
          <h3>{resultado.correoEnviado ? 'Correo enviado' : 'Liga generada'}</h3>

          {resultado.correoEnviado ? (
            <div className="ok" style={{ marginTop: 10 }}>
              Se mandó a {correo}{copiaA ? ` con copia a ${copiaA}` : ''}.
              Las respuestas llegan a tu correo.
            </div>
          ) : (
            <div className="aviso" style={{ marginTop: 10 }}>
              {resultado.errorCorreo ?? 'No se mandó el correo.'} Copia la liga
              y mándala tú; el envío ya quedó registrado.
            </div>
          )}

          <p className="tiny muted" style={{ marginTop: 12 }}>
            Esta liga no se vuelve a mostrar. En la base solo queda su huella,
            así que nadie, ni tú, puede recuperarla después. Si se pierde, se
            genera otro envío.
          </p>
          <div className="token">{resultado.liga}</div>

          <div className="mfoot">
            <button className="btn" onClick={() => {
              navigator.clipboard?.writeText(resultado.liga);
            }}>Copiar liga</button>
            <button className="btn pri" onClick={() => {
              setResultado(null); setAbierto(false); router.refresh();
            }}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
      <div className={`modal${pendiente ? ' spin' : ''}`}>
        <h3>Preparar envío</h3>
        <p className="tiny muted">
          {institucion} · se manda una liga con caducidad y marca de agua a
          nombre de quien la recibe. El correo nunca lleva los archivos
          adjuntos.
        </p>

        {error && <div className="aviso" style={{ marginTop: 12 }}>{error}</div>}

        <div className="field">
          <label htmlFor="dest">Destinatario</label>
          <input id="dest" value={destinatario} placeholder="Nombre del ejecutivo"
                 onChange={e => setDestinatario(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="mail">Correo</label>
          <input id="mail" type="email" value={correo} placeholder="ejecutivo@institucion.mx"
                 onChange={e => setCorreo(e.target.value)} />
        </div>

        <div className="field">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={mandarCorreo}
                   onChange={e => setMandarCorreo(e.target.checked)} />
            Mandar el correo desde aquí
          </label>
        </div>

        {mandarCorreo && (
          <>
            <div className="field">
              <label htmlFor="copia">Copia a (opcional)</label>
              <input id="copia" type="email" value={copiaA}
                     placeholder="tu-contador@tuempresa.mx"
                     onChange={e => setCopiaA(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="nota">Mensaje para el ejecutivo (opcional)</label>
              <textarea id="nota" rows={3} value={mensaje} maxLength={500}
                        placeholder="Adjunto lo que nos pidió el martes. La opinión del SAT es la de este mes."
                        style={{ width: '100%', border: '1px solid var(--line)',
                                 borderRadius: 'var(--r)', padding: '7px 9px', resize: 'vertical' }}
                        onChange={e => setMensaje(e.target.value)} />
              <span className="tiny muted">Las respuestas llegan a tu correo.</span>
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="dias">La liga caduca en</label>
          <select id="dias" value={dias} onChange={e => setDias(e.target.value)}>
            <option value="3">3 días</option>
            <option value="7">7 días</option>
            <option value="15">15 días</option>
            <option value="30">30 días</option>
          </select>
        </div>

        <div className="field">
          <label>
            Documentos vigentes para {institucion} ({elegidos.length} de {disponibles.length})
          </label>
          <div className="pick">
            {disponibles.map(r => (
              <label key={r.requisito_id}>
                <input type="checkbox"
                  checked={elegidos.includes(r.documento_id)}
                  onChange={e => setElegidos(prev => e.target.checked
                    ? [...prev, r.documento_id]
                    : prev.filter(x => x !== r.documento_id))} />
                {r.documento_nombre ?? r.nombre} v{r.documento_version}
              </label>
            ))}
          </div>
        </div>

        <div className="mfoot">
          <button className="btn" onClick={() => setAbierto(false)} disabled={pendiente}>
            Cancelar
          </button>
          <button className="btn pri" disabled={pendiente} onClick={() => empezar(async () => {
            setError('');
            if (!destinatario.trim()) { setError('Falta el nombre del destinatario.'); return; }
            if (!correo.trim()) { setError('Falta el correo.'); return; }
            if (!elegidos.length) { setError('Elige al menos un documento.'); return; }

            const versiones = disponibles
              .filter(r => elegidos.includes(r.documento_id))
              .map(r => r.version_id)
              .filter(Boolean);

            const r = await crearEnvio({
              tramiteId, destinatario, correo,
              dias: Number(dias), versiones,
              mensaje: mensaje.trim() || undefined,
              mandarCorreo,
              copiaA: copiaA.trim() || undefined,
            });
            if (r.error) { setError(r.error); return; }
            setResultado(r);
          })}>
            {pendiente ? 'Enviando…' : mandarCorreo ? 'Enviar al ejecutivo' : 'Generar liga'}
          </button>
        </div>
      </div>
    </div>
  );
}

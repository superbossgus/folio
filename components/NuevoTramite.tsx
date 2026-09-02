'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { abrirTramite } from '@/lib/acciones';
import { PRODUCTOS } from '@/lib/formato';

export default function NuevoTramite(
  { razonSocialId, instituciones }: { razonSocialId: string; instituciones: any[] }
) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState('');
  const [producto, setProducto] = useState(PRODUCTOS[0].clave);
  const [institucionId, setInstitucionId] = useState(instituciones[0]?.id ?? '');
  const [monto, setMonto] = useState('5000000');
  const [destino, setDestino] = useState('Capital de trabajo');
  const [plazo, setPlazo] = useState('');

  if (!abierto) {
    return <button className="btn pri" onClick={() => setAbierto(true)}>Abrir trámite</button>;
  }

  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
      <div className={`modal${pendiente ? ' spin' : ''}`}>
        <h3>Abrir trámite</h3>
        <p className="tiny muted">
          El checklist se arma con lo que esa institución pide para ese producto,
          y jala de la bóveda todo lo que ya tengas vigente.
        </p>

        {error && <div className="aviso" style={{ marginTop: 12 }}>{error}</div>}

        <div className="field">
          <label htmlFor="producto">Producto</label>
          <select id="producto" value={producto} onChange={e => setProducto(e.target.value)}>
            {PRODUCTOS.map(p => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="inst">Institución</label>
          <select id="inst" value={institucionId} onChange={e => setInstitucionId(e.target.value)}>
            {instituciones.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="monto">Monto solicitado (MXN)</label>
          <input id="monto" type="number" min="0" step="100000"
                 value={monto} onChange={e => setMonto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="destino">Destino de los recursos</label>
          <input id="destino" value={destino} onChange={e => setDestino(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="plazo">Plazo (opcional)</label>
          <input id="plazo" value={plazo} placeholder="60 meses"
                 onChange={e => setPlazo(e.target.value)} />
        </div>

        <div className="mfoot">
          <button className="btn" onClick={() => setAbierto(false)} disabled={pendiente}>Cancelar</button>
          <button className="btn pri" disabled={pendiente} onClick={() => empezar(async () => {
            setError('');
            const r = await abrirTramite({
              razonSocialId, institucionId, producto,
              monto: Number(monto) || 0, destino, plazo: plazo || undefined,
            });
            if (r.error) { setError(r.error); return; }
            setAbierto(false);
            router.push(`/tramites/${r.id}`);
          })}>
            {pendiente ? 'Abriendo…' : 'Abrir trámite'}
          </button>
        </div>
      </div>
    </div>
  );
}

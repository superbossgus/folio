'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { crearPaquete } from '@/lib/acciones';
import { bajarPaquete } from '@/lib/paquete-navegador';
import { etiquetaVigencia } from '@/lib/formato';
import Chip from '@/components/Chip';

const TITULO: Record<string, string> = {
  corporativo: 'Corporativo', fiscal: 'Fiscal', financiero: 'Financiero',
  garantias: 'Garantías', personas: 'Personas', domicilio: 'Domicilio', otros: 'Otros',
};
const ORDEN = ['corporativo', 'fiscal', 'financiero', 'garantias', 'personas', 'domicilio', 'otros'];

/* El camino bueno sigue siendo la liga: caduca, se revoca y dice quién la
   abrió. Este es el otro, el que se usa cuando del otro lado piden el
   expediente adjunto y no hay manera de convencerlos. Un zip no se puede
   revocar, así que lo único que se puede hacer es dejar constancia: para
   quién se armó, qué llevaba y a qué hora. Eso es lo que hace esta
   pantalla, y por eso el registro se guarda aunque el correo lo mande
   después el usuario por su cuenta. */
export default function EnviarInformacion(
  { razonSocialId, empresa, documentos }:
  { razonSocialId: string; empresa: string; documentos: any[] }
) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<any>(null);

  const [destinatario, setDestinatario] = useState('');
  const [organizacion, setOrganizacion] = useState('');
  const [correo, setCorreo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [marca, setMarca] = useState(true);

  // Solo lo que ya pasó la revisión. Una versión pendiente no sale de la
  // bóveda por ningún camino, tampoco por este.
  const disponibles = documentos
    .filter((d: any) => d.version_id && d.antivirus === 'limpio')
    .sort((a: any, b: any) =>
      ORDEN.indexOf(a.categoria) - ORDEN.indexOf(b.categoria) ||
      a.nombre.localeCompare(b.nombre, 'es'));

  const vigentes = disponibles.filter((d: any) => d.estado !== 'vencido');
  const [elegidos, setElegidos] = useState<string[]>(vigentes.map((d: any) => d.version_id));

  const seleccion = disponibles.filter((d: any) => elegidos.includes(d.version_id));
  const vencidosElegidos = seleccion.filter((d: any) => d.estado === 'vencido').length;

  function abrir() {
    setError('');
    setDestinatario(''); setOrganizacion(''); setCorreo(''); setMotivo('');
    setMarca(true);
    setElegidos(vigentes.map((d: any) => d.version_id));
    setAbierto(true);
  }

  if (!abierto && !resultado) {
    return (
      <button className="btn" disabled={!disponibles.length} onClick={abrir}>
        Enviar información
      </button>
    );
  }

  /* Pantalla posterior. El paquete ya está registrado aunque la descarga
     haya fallado: si el zip no bajó, se vuelve a intentar desde aquí o
     desde Envíos, y sale idéntico porque las versiones ya quedaron
     selladas en el renglón. */
  if (resultado) {
    return (
      <div className="scrim">
        <div className="modal">
          <h3>{resultado.bajado ? 'Paquete descargado' : 'Paquete registrado'}</h3>

          {resultado.bajado ? (
            <div className="ok" style={{ marginTop: 10 }}>
              Se armó <b>{resultado.archivo}</b> con {resultado.documentos} documento
              {resultado.documentos > 1 ? 's' : ''} a nombre de {resultado.destinatario}.
              Búscalo en tus descargas y mándalo tú por correo.
            </div>
          ) : (
            <div className="aviso" style={{ marginTop: 10 }}>
              {resultado.errorDescarga} El paquete ya quedó registrado; vuelve
              a intentar la descarga.
            </div>
          )}

          <p className="tiny muted" style={{ marginTop: 12 }}>
            Un adjunto no caduca ni se puede revocar. Lo que sí queda es el
            registro: en <b>Envíos</b> aparece a quién iba, qué llevaba y la
            fecha y hora exactas. Dentro del zip va la misma constancia en
            <b> 00 contenido.txt</b>.
          </p>

          <div className="mfoot">
            <button className="btn" disabled={pendiente} onClick={() => empezar(async () => {
              try {
                await bajarPaquete(resultado.paqueteId, resultado.archivo);
                setResultado({ ...resultado, bajado: true });
              } catch (e: any) {
                setResultado({ ...resultado, bajado: false, errorDescarga: e.message });
              }
            })}>
              {pendiente ? 'Armando…' : 'Descargar otra vez'}
            </button>
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
        <h3>Enviar información</h3>
        <p className="tiny muted">
          {empresa} · se arma un zip con lo que elijas y lo mandas tú por
          correo. Queda el registro de a quién se lo mandaste, qué llevaba y
          a qué hora.
        </p>

        {error && <div className="aviso" style={{ marginTop: 12 }}>{error}</div>}

        <div className="field">
          <label htmlFor="pdest">¿Para quién?</label>
          <input id="pdest" value={destinatario} placeholder="Nombre de quien lo va a recibir"
                 onChange={e => setDestinatario(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="porg">Institución o empresa (opcional)</label>
          <input id="porg" value={organizacion} placeholder="BBVA · Mesa de crédito"
                 onChange={e => setOrganizacion(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pcorreo">Correo al que se lo vas a mandar (opcional)</label>
          <input id="pcorreo" type="email" value={correo} placeholder="ejecutivo@institucion.mx"
                 onChange={e => setCorreo(e.target.value)} />
          <span className="tiny muted">
            Aquí no se manda nada: es para que el registro diga a dónde salió.
          </span>
        </div>
        <div className="field">
          <label htmlFor="pmotivo">Motivo (opcional)</label>
          <input id="pmotivo" value={motivo} maxLength={200}
                 placeholder="Expediente inicial para la línea de factoraje"
                 onChange={e => setMotivo(e.target.value)} />
        </div>

        <div className="field">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={marca}
                   onChange={e => setMarca(e.target.checked)} />
            Imprimir marca de agua a nombre del destinatario
          </label>
          <span className="tiny muted">
            {marca
              ? 'Cada PDF sale marcado con su nombre y la fecha. Si el archivo se filtra, dice de dónde salió.'
              : 'Sin marca los archivos salen tal cual. Úsalo solo si la institución los rechaza marcados.'}
          </span>
        </div>

        <div className="field">
          <label>
            ¿Qué información quieres enviar? ({elegidos.length} de {disponibles.length})
            <span style={{ fontWeight: 400, marginLeft: 8 }}>
              <button type="button" className="enlace"
                onClick={() => setElegidos(disponibles.map((d: any) => d.version_id))}>todos</button>
              {' · '}
              <button type="button" className="enlace"
                onClick={() => setElegidos(vigentes.map((d: any) => d.version_id))}>solo vigentes</button>
              {' · '}
              <button type="button" className="enlace"
                onClick={() => setElegidos([])}>ninguno</button>
            </span>
          </label>
          <div className="pick">
            {disponibles.map((d: any, i: number) => {
              const e = etiquetaVigencia(d.estado, d.dias_restantes);
              const nuevaCategoria = i === 0 || disponibles[i - 1].categoria !== d.categoria;
              return (
                <Fragment key={d.documento_id}>
                  {nuevaCategoria && <div className="cat">{TITULO[d.categoria] ?? d.categoria}</div>}
                  <label>
                    <input type="checkbox"
                      checked={elegidos.includes(d.version_id)}
                      onChange={ev => setElegidos(prev => ev.target.checked
                        ? [...prev, d.version_id]
                        : prev.filter(x => x !== d.version_id))} />
                    <span style={{ flex: 1 }}>{d.nombre} v{d.version}</span>
                    <Chip clase={e.clase}>{e.texto}</Chip>
                  </label>
                </Fragment>
              );
            })}
          </div>
          {vencidosElegidos > 0 && (
            <span className="tiny" style={{ color: 'var(--risk)' }}>
              Vas a mandar {vencidosElegidos} documento{vencidosElegidos > 1 ? 's' : ''} vencido
              {vencidosElegidos > 1 ? 's' : ''}. La institución lo va a rechazar.
            </span>
          )}
        </div>

        <div className="mfoot">
          <button className="btn" onClick={() => setAbierto(false)} disabled={pendiente}>
            Cancelar
          </button>
          <button className="btn pri" disabled={pendiente} onClick={() => empezar(async () => {
            setError('');
            if (!destinatario.trim()) { setError('Falta el nombre de quien va a recibir la información.'); return; }
            if (correo.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) {
              setError('El correo no tiene forma de correo.'); return;
            }
            if (!elegidos.length) { setError('Elige al menos un documento.'); return; }

            const r = await crearPaquete({
              razonSocialId, destinatario: destinatario.trim(),
              versiones: elegidos,
              correo: correo.trim() || undefined,
              organizacion: organizacion.trim() || undefined,
              motivo: motivo.trim() || undefined,
              marcaAgua: marca,
            });
            if (r.error) { setError(r.error); return; }

            const base = {
              paqueteId: r.paqueteId!, archivo: r.archivo!,
              documentos: elegidos.length, destinatario: destinatario.trim(),
            };
            try {
              await bajarPaquete(base.paqueteId, base.archivo);
              setResultado({ ...base, bajado: true });
            } catch (e: any) {
              setResultado({ ...base, bajado: false, errorDescarga: e.message });
            }
          })}>
            {pendiente ? 'Armando el zip…' : `Generar zip (${elegidos.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

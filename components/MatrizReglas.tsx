/* La misma hoja de papel, distinto veredicto según quién la pida. Es la
   tabla que ningún archivo compartido puede tener. */
export default function MatrizReglas(
  { docs, instituciones, reglas, tipos }:
  { docs: any[]; instituciones: any[]; reglas: any[]; tipos: any[] }
) {
  const porTipo = new Map(tipos.map((t: any) => [t.id, t]));
  const claveDeTipo = new Map(tipos.map((t: any) => [t.clave, t.id]));

  // Solo interesan los documentos donde las instituciones NO coinciden.
  const variables = docs.filter((d: any) => {
    const tipoId = claveDeTipo.get(d.clave);
    const base = porTipo.get(tipoId)?.vigencia_dias ?? null;
    const propias = reglas.filter(r => r.tipo_documento_id === tipoId).map(r => r.dias_maximos);
    if (!propias.length) return false;
    const distintos = new Set([...propias, base].filter(v => v != null));
    return distintos.size > 1;
  });

  if (!variables.length || !instituciones.length) return null;

  const corto = (n: string) => n.replace(/^Banco /, '').split(' ')[0];
  const regla = (clave: string, institucionId: string) => {
    const tipoId = claveDeTipo.get(clave);
    const r = reglas.find(x => x.tipo_documento_id === tipoId && x.institucion_id === institucionId);
    return r?.dias_maximos ?? porTipo.get(tipoId)?.vigencia_dias ?? null;
  };

  return (
    <section>
      <h2>Cuántos días de antigüedad acepta cada institución</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        El mismo documento puede servir en un banco y estar vencido en otro.
        La celda se marca en rojo cuando tu versión actual ya no pasa ahí.
      </p>
      <div className="mwrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="doc">Documento</th>
              <th>Tu versión</th>
              {instituciones.map((i: any) => <th key={i.id}>{corto(i.nombre)}</th>)}
            </tr>
          </thead>
          <tbody>
            {variables.map((d: any) => (
              <tr key={d.documento_id}>
                <th className="doc">{d.nombre}</th>
                <td className="si"><b>{d.antiguedad_dias ?? '—'}</b> días</td>
                {instituciones.map((i: any) => {
                  const r = regla(d.clave, i.id);
                  if (r == null) return <td className="na" key={i.id}>—</td>;
                  const pasa = (d.antiguedad_dias ?? 0) <= r;
                  return (
                    <td className={pasa ? 'si' : 'no'} key={i.id}>
                      <b>{r}</b>{pasa ? '' : ' ✕'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

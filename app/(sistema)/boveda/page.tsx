import { contexto, documentos, tiposDocumento, instituciones,
         fecha, etiquetaVigencia } from '@/lib/datos';
import Chip from '@/components/Chip';
import SubirDocumento from '@/components/SubirDocumento';
import MatrizReglas from '@/components/MatrizReglas';

export const dynamic = 'force-dynamic';

const ORDEN = ['corporativo', 'fiscal', 'financiero', 'garantias', 'personas', 'domicilio', 'otros'];
const TITULO: Record<string, string> = {
  corporativo: 'Corporativo', fiscal: 'Fiscal', financiero: 'Financiero',
  garantias: 'Garantías', personas: 'Personas', domicilio: 'Domicilio', otros: 'Otros',
};

export default async function Boveda() {
  const { sb, rs } = await contexto();
  const [docs, tipos, insts, { data: reglas }] = await Promise.all([
    documentos(sb, rs!.id),
    tiposDocumento(sb),
    instituciones(sb),
    sb.from('reglas_vigencia')
      .select('institucion_id, tipo_documento_id, dias_maximos, producto, fuente')
      .lte('vigente_desde', new Date().toISOString().slice(0, 10)),
  ]);

  const reuso = docs.reduce((s: number, d: any) => s + (d.tramites_ligados ?? 0), 0);
  const ligados = docs.filter((d: any) => d.tramites_ligados > 0).length;
  const vencidos = docs.filter((d: any) => d.estado === 'vencido').length;

  const porCategoria: Record<string, any[]> = {};
  docs.forEach((d: any) => (porCategoria[d.categoria] ??= []).push(d));

  return (
    <>
      <h1>Bóveda</h1>
      <p className="sub">
        Una sola fuente. Cada documento se carga aquí una vez y todos los
        trámites abiertos lo toman de este lugar. Si lo actualizas, se
        actualiza en todas las instituciones al mismo tiempo.
      </p>

      <div style={{ marginBottom: 16 }}>
        <SubirDocumento razonSocialId={rs!.id} tipos={tipos} documentos={docs} />
      </div>

      {docs.length === 0 ? (
        <div className="empty">
          <b>Bóveda vacía</b>
          Empieza por el acta constitutiva, los poderes y la constancia de
          situación fiscal.
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="v">{docs.length}</div>
              <div className="l">Documentos en la bóveda</div></div>
            <div className="kpi"><div className="v">{reuso}</div>
              <div className="l">Veces que se reutilizan en trámites</div></div>
            <div className="kpi"><div className="v">{ligados}</div>
              <div className="l">Documentos ligados a algún trámite</div></div>
            <div className={`kpi${vencidos ? ' hot' : ''}`}><div className="v">{vencidos}</div>
              <div className="l">Vencidos y frenando trámites</div></div>
          </div>

          {ORDEN.filter(c => porCategoria[c]).map(cat => {
            const lista = porCategoria[cat];
            const v = lista.filter((d: any) => d.estado === 'vencido').length;
            return (
              <section key={cat}>
                <h2>
                  {TITULO[cat]}{' '}
                  <span className="tiny muted" style={{ fontWeight: 400 }}>
                    · {lista.length} documentos{v ? ` · ${v} vencido${v > 1 ? 's' : ''}` : ''}
                  </span>
                </h2>
                <div className="rows">
                  <div className="row head r-doc">
                    <span>Documento</span><span>Antigüedad aceptada</span>
                    <span>Estado</span><span className="act">Acción</span>
                  </div>
                  {lista.map((d: any) => {
                    const e = etiquetaVigencia(d.estado, d.dias_restantes);
                    const vida = d.dias_maximos && d.dias_restantes != null
                      ? Math.max(0, Math.min(100, Math.round((d.dias_restantes * 100) / d.dias_maximos)))
                      : null;
                    const clase = d.estado === 'vencido' ? 'risk' : d.estado === 'por_vencer' ? 'warn' : 'ok';
                    return (
                      <div className="row r-doc" key={d.documento_id}>
                        <div className="name">
                          {d.nombre}
                          <small>
                            {d.folio ? `${d.folio} · ` : ''}v{d.version ?? '—'} · emitido el {fecha(d.emitido_en)}
                            {d.antivirus === 'pendiente' && ' · versión nueva en revisión'}
                            {d.tramites_ligados > 0
                              ? ` · alimenta ${d.tramites_ligados} trámite${d.tramites_ligados > 1 ? 's' : ''}`
                              : ' · sin trámite ligado'}
                          </small>
                          {vida != null && (
                            <div className={`life ${clase}`}><i style={{ width: `${vida}%` }} /></div>
                          )}
                        </div>
                        <span className="tiny muted">
                          {d.dias_maximos ? `${d.dias_maximos} días` : 'Permanente'}
                          {d.institucion_critica ? ` · ${d.institucion_critica}` : ''}
                        </span>
                        <span><Chip clase={e.clase}>{e.texto}</Chip></span>
                        <span className="act">
                          <SubirDocumento razonSocialId={rs!.id} tipos={tipos}
                                          documentos={docs} renovar={d} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <MatrizReglas docs={docs} instituciones={insts} reglas={reglas ?? []} tipos={tipos} />
        </>
      )}
    </>
  );
}

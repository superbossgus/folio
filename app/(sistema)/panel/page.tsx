import Link from 'next/link';
import { contexto, agenda, tramites, contratos, documentos,
         pesos, fecha, etiquetaVigencia, nombreEtapa, nombreProducto } from '@/lib/datos';
import Chip from '@/components/Chip';
import FranjaVencimientos from '@/components/FranjaVencimientos';
import BotonObligacion from '@/components/BotonObligacion';

export const dynamic = 'force-dynamic';

export default async function Panel() {
  const { sb, rs } = await contexto();
  const [fechas, solicitudes, creditos, docs] = await Promise.all([
    agenda(sb, rs!.id), tramites(sb, rs!.id), contratos(sb, rs!.id), documentos(sb, rs!.id),
  ]);

  const abiertos = solicitudes.filter((t: any) =>
    !['contratado', 'declinado', 'cancelado'].includes(t.etapa));

  const enProceso = abiertos
    .filter((t: any) => t.etapa !== 'prospeccion')
    .reduce((s: number, t: any) => s + Number(t.monto), 0);
  const deuda = creditos
    .filter((c: any) => c.estado === 'vigente')
    .reduce((s: number, c: any) => s + Number(c.saldo), 0);

  const docsAlerta = docs.filter((d: any) => d.estado === 'vencido' || d.estado === 'por_vencer');
  const oblAlerta = fechas.filter((f: any) => f.clase === 'obligacion' && f.dias <= 30);

  if (!docs.length && !solicitudes.length) {
    return (
      <>
        <h1>Panel</h1>
        <p className="sub">Esta razón social todavía no tiene expediente.</p>
        <div className="empty">
          <b>Empieza por la bóveda</b>
          Carga el acta constitutiva, los poderes y la constancia de situación
          fiscal. Con eso ya puedes abrir tu primer trámite.
          <div style={{ marginTop: 14 }}>
            <Link className="btn pri" href="/boveda">Ir a la bóveda</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Panel</h1>
      <p className="sub">
        Todo lo que vence, se debe entregar o está detenido, en un solo lugar.
      </p>

      <FranjaVencimientos eventos={fechas} />

      <div className="kpis">
        <div className={`kpi${docsAlerta.length ? ' hot' : ''}`}>
          <div className="v">{docsAlerta.length}</div>
          <div className="l">Documentos vencidos o por vencer</div>
        </div>
        <div className={`kpi${oblAlerta.some((o: any) => o.dias < 0) ? ' hot' : ''}`}>
          <div className="v">{oblAlerta.length}</div>
          <div className="l">Obligaciones en los próximos 30 días</div>
        </div>
        <div className="kpi">
          <div className="v">{pesos(enProceso)}</div>
          <div className="l">En proceso de autorización</div>
        </div>
        <div className="kpi">
          <div className="v">{pesos(deuda)}</div>
          <div className="l">Saldo insoluto contratado</div>
        </div>
      </div>

      {docsAlerta.length > 0 && (
        <section>
          <h2>Atender primero</h2>
          <div className="rows">
            <div className="row head r-doc">
              <span>Documento</span><span>Institución más estricta</span>
              <span>Estado</span><span className="act">Acción</span>
            </div>
            {docsAlerta.slice(0, 6).map((d: any) => {
              const v = etiquetaVigencia(d.estado, d.dias_restantes);
              return (
                <div className="row r-doc" key={d.documento_id}>
                  <div className="name">
                    {d.nombre}
                    <small>
                      v{d.version ?? '—'} · emitido el {fecha(d.emitido_en)}
                      {d.tramites_ligados > 0 && ` · frena ${d.tramites_ligados} trámite${d.tramites_ligados > 1 ? 's' : ''}`}
                    </small>
                  </div>
                  <span className="tiny muted">{d.institucion_critica ?? d.categoria}</span>
                  <span><Chip clase={v.clase}>{v.texto}</Chip></span>
                  <span className="act">
                    <Link className="btn sm" href={`/boveda?doc=${d.documento_id}`}>Renovar</Link>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {oblAlerta.length > 0 && (
        <section>
          <h2>Obligaciones con las instituciones</h2>
          <div className="rows">
            <div className="row head r-obl">
              <span>Obligación</span><span>Institución</span>
              <span>Fecha</span><span className="act">Acción</span>
            </div>
            {oblAlerta.map((o: any) => (
              <div className="row r-obl" key={o.origen_id}>
                <div className="name">{o.titulo}<small>{fecha(o.fecha)}</small></div>
                <span className="tiny muted">{o.detalle}</span>
                <span>
                  <Chip clase={o.dias < 0 ? 'c-risk' : o.dias <= 15 ? 'c-warn' : 'c-idle'}>
                    {o.dias < 0 ? `Vencida hace ${-o.dias} d` : `En ${o.dias} d`}
                  </Chip>
                </span>
                <span className="act"><BotonObligacion id={o.origen_id} /></span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Trámites abiertos</h2>
        {abiertos.length === 0 ? (
          <div className="empty">
            <b>Sin trámites abiertos</b>
            Abre uno y el checklist de requisitos se arma solo con lo que ya tienes.
          </div>
        ) : (
          <div className="rows">
            <div className="row head r-tra">
              <span>Trámite</span><span>Etapa</span>
              <span>Requisitos</span><span className="num">Monto</span>
            </div>
            {abiertos.map((t: any) => {
              const a = t.v_tramite_avance?.[0] ?? t.v_tramite_avance ?? {};
              return (
                <Link className="row click r-tra" href={`/tramites/${t.id}`} key={t.id}>
                  <div className="name">
                    {nombreProducto(t.producto)} · {t.instituciones?.nombre}
                    <small>Abierto el {fecha(t.abierto_en)}{t.plazo ? ` · ${t.plazo}` : ''}</small>
                  </div>
                  <span className="tiny muted">{nombreEtapa(t.etapa)}</span>
                  <span>
                    <div className="prog"><i style={{ width: `${a.porcentaje ?? 0}%` }} /></div>
                    <span className="tiny" style={a.caducos ? { color: 'var(--risk)', fontWeight: 600 } : { color: 'var(--ink2)' }}>
                      {a.cubiertos ?? 0} de {a.total ?? 0}
                      {a.caducos ? ` · ${a.caducos} vencido${a.caducos > 1 ? 's' : ''}` : ''}
                    </span>
                  </span>
                  <span className="num">{pesos(t.monto)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

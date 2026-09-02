import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contexto, pesos, fecha, ETAPAS, nombreEtapa, nombreProducto,
         etiquetaVigencia } from '@/lib/datos';
import Chip from '@/components/Chip';
import BotonEtapa from '@/components/BotonEtapa';
import NuevoEnvio from '@/components/NuevoEnvio';
import CasillaRequisito from '@/components/CasillaRequisito';

export const dynamic = 'force-dynamic';

export default async function Tramite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb, rs } = await contexto();

  const { data: t } = await sb.from('tramites')
    .select('*, instituciones(nombre)').eq('id', id).single();
  if (!t) notFound();

  const [{ data: req }, { data: avance }, { data: envios }] = await Promise.all([
    sb.from('v_requisito_estado').select('*').eq('tramite_id', id).order('nombre'),
    sb.from('v_tramite_avance').select('*').eq('tramite_id', id).single(),
    sb.from('envios').select('id, titulo, destinatario, expira_en, revocado_en, envio_accesos(accion)')
      .eq('tramite_id', id).order('creado_en', { ascending: false }),
  ]);

  const requisitos = req ?? [];
  const a = avance ?? { total: 0, cubiertos: 0, caducos: 0, porcentaje: 0 };
  const iEtapa = ETAPAS.findIndex(e => e.clave === t.etapa);
  const faltan = requisitos.filter((r: any) =>
    r.estado !== 'cubierto' || r.vigencia === 'vencido');

  // Solo se puede enviar lo que está vigente para ESTA institución.
  const enviables = requisitos.filter((r: any) =>
    r.estado === 'cubierto' && r.vigencia !== 'vencido' && r.documento_id);

  return (
    <>
      <Link className="link" href="/tramites" style={{ marginBottom: 14, display: 'inline-block' }}>
        Volver a trámites
      </Link>

      <div className="card" style={{ padding: 18 }}>
        <div className="dh">
          <div>
            <h1 style={{ margin: 0 }}>{nombreProducto(t.producto)}</h1>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {t.instituciones?.nombre}{t.ejecutivo ? ` · ${t.ejecutivo}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="amt">{pesos(t.monto)}</div>
            <div className="tiny muted">{t.plazo ?? 'Plazo por definir'}</div>
          </div>
        </div>

        <div className="pipe">
          {ETAPAS.map((e, i) => (
            <div key={e.clave} className={i < iEtapa ? 'done' : i === iEtapa ? 'now' : ''}>
              {e.nombre}
            </div>
          ))}
        </div>

        <div className="meta">
          <div><b>Destino</b>{t.destino ?? '—'}</div>
          <div><b>Abierto</b>{fecha(t.abierto_en)}</div>
          <div><b>Requisitos</b>{a.cubiertos} de {a.total} ({a.porcentaje}%)</div>
          <div><b>Faltantes</b>{faltan.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 9, margin: '16px 0', flexWrap: 'wrap' }}>
        <NuevoEnvio tramiteId={t.id} requisitos={enviables}
                    institucion={t.instituciones?.nombre ?? ''} />
        <BotonEtapa tramiteId={t.id} etapa={nombreEtapa(t.etapa)} />
      </div>

      {a.caducos > 0 && (
        <div className="aviso">
          {a.caducos} requisito{a.caducos > 1 ? 's' : ''} dejó de contar porque
          el documento de la bóveda venció para {t.instituciones?.nombre}.
          Renuévalo una vez y se destraba aquí y en los demás trámites.
        </div>
      )}

      <section>
        <h2>Requisitos solicitados</h2>
        <div className="rows">
          <div className="row head r-req">
            <span />
            <span>Requisito</span>
            <span>Origen</span>
            <span className="act">Estado</span>
          </div>
          {requisitos.map((r: any) => {
            const caduco = r.vigencia === 'vencido';
            const cubierto = r.estado === 'cubierto' && !caduco;
            const chip = r.estado === 'observado'
              ? { texto: 'Observado', clase: 'c-warn' }
              : caduco && r.estado === 'cubierto'
              ? { texto: 'Documento vencido', clase: 'c-risk' }
              : cubierto
              ? { texto: 'Entregado', clase: 'c-ok' }
              : { texto: 'Pendiente', clase: 'c-idle' };

            const v = r.documento_id ? etiquetaVigencia(r.vigencia, r.dias_restantes) : null;

            return (
              <div className="row r-req" key={r.requisito_id}>
                <span>
                  <CasillaRequisito id={r.requisito_id} marcado={cubierto}
                                    bloqueado={!!r.documento_id} />
                </span>
                <div className="name">
                  {r.nombre}
                  <small>
                    {r.documento_id
                      ? <>De la bóveda · v{r.documento_version}
                          {r.dias_maximos
                            ? ` · ${r.institucion} acepta ${r.dias_maximos} días · ${v?.texto}`
                            : ' · sin vencimiento'}</>
                      : 'Documento propio de esta solicitud'}
                  </small>
                </div>
                <span className="tiny muted">
                  {r.documento_id ? 'Bóveda' : 'Específico'}
                </span>
                <span className="act"><Chip clase={chip.clase}>{chip.texto}</Chip></span>
              </div>
            );
          })}
        </div>
      </section>

      {(envios?.length ?? 0) > 0 && (
        <section>
          <h2>Envíos de este trámite</h2>
          <div className="rows">
            {envios!.map((e: any) => {
              const vivo = !e.revocado_en && new Date(e.expira_en) > new Date();
              const descargas = (e.envio_accesos ?? []).filter((x: any) => x.accion === 'descargo').length;
              return (
                <div className="row r-env" key={e.id}>
                  <div className="name">{e.titulo}
                    <small>{e.destinatario} · expira el {fecha(e.expira_en)}</small>
                  </div>
                  <span className="tiny muted">{e.destinatario}</span>
                  <span>
                    <Chip clase={vivo ? 'c-ok' : 'c-idle'}>
                      {e.revocado_en ? 'Revocada' : vivo ? 'Activa' : 'Caducada'}
                    </Chip>
                  </span>
                  <span className="num">{descargas}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

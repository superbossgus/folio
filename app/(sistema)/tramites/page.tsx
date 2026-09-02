import Link from 'next/link';
import { contexto, tramites, instituciones, pesos, fecha,
         nombreEtapa, nombreProducto } from '@/lib/datos';
import NuevoTramite from '@/components/NuevoTramite';

export const dynamic = 'force-dynamic';

export default async function Tramites() {
  const { sb, rs } = await contexto();
  const [lista, insts] = await Promise.all([tramites(sb, rs!.id), instituciones(sb)]);

  return (
    <>
      <h1>Trámites</h1>
      <p className="sub">
        Cada solicitud con su checklist de requisitos, armado según lo que pide
        esa institución para ese producto.
      </p>

      <div style={{ marginBottom: 16 }}>
        <NuevoTramite razonSocialId={rs!.id} instituciones={insts} />
      </div>

      {lista.length === 0 ? (
        <div className="empty">
          <b>Sin trámites</b>
          Abre uno y el checklist se arma solo con lo que ya tienes en la bóveda.
        </div>
      ) : (
        <div className="rows">
          <div className="row head r-tra">
            <span>Trámite</span><span>Etapa</span>
            <span>Requisitos</span><span className="num">Monto</span>
          </div>
          {lista.map((t: any) => {
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
    </>
  );
}

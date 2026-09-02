import { contexto, contratos, obligaciones, pesos, fecha, nombreProducto } from '@/lib/datos';
import Chip from '@/components/Chip';
import BotonObligacion from '@/components/BotonObligacion';

export const dynamic = 'force-dynamic';

export default async function Contratos() {
  const { sb, rs } = await contexto();
  const [lista, obls] = await Promise.all([contratos(sb, rs!.id), obligaciones(sb, rs!.id)]);

  return (
    <>
      <h1>Contratos y obligaciones</h1>
      <p className="sub">
        Lo firmado y lo que sigue debiéndose después de la firma: entregas
        periódicas, razones financieras y renovaciones.
      </p>

      {lista.length === 0 ? (
        <div className="empty">
          <b>Sin contratos registrados</b>
          Cuando un trámite llega a la etapa de contratado, aparece aquí.
        </div>
      ) : lista.map((c: any) => {
        const suyas = obls.filter((o: any) => o.contrato_id === c.id);
        const pendientes = suyas.filter((o: any) => o.estado === 'pendiente').length;
        const amortizado = c.monto > 0
          ? Math.round(((c.monto - c.saldo) * 100) / c.monto) : 0;

        return (
          <section key={c.id}>
            <div className="card" style={{ padding: 18 }}>
              <div className="dh">
                <div>
                  <h2 style={{ margin: 0, fontSize: 16 }}>
                    {nombreProducto(c.producto)} · {c.instituciones?.nombre}
                  </h2>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    Firmado el {fecha(c.firmado_en)}
                    {c.vence_en ? ` · vence el ${fecha(c.vence_en)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="amt">{pesos(c.saldo)}</div>
                  <div className="tiny muted">saldo de {pesos(c.monto)}</div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="prog"><i style={{ width: `${amortizado}%` }} /></div>
                <div className="tiny muted" style={{ marginTop: 4 }}>{amortizado}% amortizado</div>
              </div>

              <div className="meta">
                <div><b>Tasa o renta</b>{c.tasa ?? 'Por registrar'}</div>
                <div><b>Garantía</b>{c.garantia ?? 'Por registrar'}</div>
                <div><b>Obligaciones pendientes</b>{pendientes}</div>
              </div>
            </div>

            {suyas.length > 0 && (
              <div className="rows" style={{ marginTop: 12 }}>
                <div className="row head r-obl">
                  <span>Obligación</span><span>Tipo</span>
                  <span>Fecha</span><span className="act">Acción</span>
                </div>
                {suyas.map((o: any) => {
                  const dias = Math.round(
                    (+new Date(o.proxima_fecha + 'T00:00:00') - +new Date(new Date().toDateString())) / 86400000);
                  const clase = o.estado === 'cumplida' ? 'c-ok'
                    : dias < 0 ? 'c-risk' : dias <= 15 ? 'c-warn' : 'c-idle';
                  const texto = o.estado === 'cumplida' ? 'Cumplida'
                    : dias < 0 ? `Vencida hace ${-dias} d` : `En ${dias} d`;
                  return (
                    <div className="row r-obl" key={o.id}>
                      <div className="name">{o.descripcion}
                        <small>{o.tipo} · {o.periodicidad ?? 'única'}</small>
                      </div>
                      <span className="tiny muted">{o.tipo}</span>
                      <span><Chip clase={clase}>{texto}</Chip></span>
                      <span className="act">
                        {o.estado === 'pendiente'
                          ? <BotonObligacion id={o.id} />
                          : <span className="tiny muted">{fecha(o.cumplida_en)}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

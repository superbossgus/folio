import { contexto, envios, fecha, nombreProducto } from '@/lib/datos';
import Chip from '@/components/Chip';
import BotonRevocar from '@/components/BotonRevocar';

export const dynamic = 'force-dynamic';

export default async function Envios() {
  const { sb, rs } = await contexto();
  const lista = await envios(sb, rs!.id);

  return (
    <>
      <h1>Envíos</h1>
      <p className="sub">
        Cada paquete se manda como liga con caducidad y marca de agua a nombre
        de quien lo recibe. Queda registro de quién lo abrió y cuándo.
      </p>

      {lista.length === 0 ? (
        <div className="empty">
          <b>Sin envíos</b>
          Abre un trámite y usa «Preparar envío» para mandar el paquete a la institución.
        </div>
      ) : (
        <div className="rows">
          <div className="row head r-env">
            <span>Envío</span><span>Destinatario</span>
            <span>Liga</span><span className="num">Accesos</span>
          </div>
          {lista.map((e: any) => {
            const vivo = !e.revocado_en && new Date(e.expira_en) > new Date();
            const dias = Math.ceil((+new Date(e.expira_en) - Date.now()) / 86400000);
            const accesos = e.envio_accesos ?? [];
            const descargas = accesos.filter((a: any) => a.accion === 'descargo').length;
            const ultimo = accesos.length
              ? accesos.map((a: any) => a.ocurrio_en).sort().at(-1) : null;
            return (
              <div className="row r-env" key={e.id}>
                <div className="name">
                  {e.titulo}
                  <small>
                    {e.envio_items?.length ?? 0} documentos
                    {e.tramites ? ` · ${nombreProducto(e.tramites.producto)}` : ''}
                    {' · creado el '}{fecha(e.creado_en)}
                  </small>
                  <small className="tiny" style={{ display: 'block', marginTop: 2,
                    color: e.correo_error ? 'var(--risk)' : 'var(--ink2)' }}>
                    {e.correo_enviado_en
                      ? `Correo enviado el ${fecha(e.correo_enviado_en)}`
                      : e.correo_error
                      ? `El correo no salió: ${e.correo_error}`
                      : 'La liga se compartió a mano'}
                  </small>
                </div>
                <span className="tiny muted">{e.destinatario}<br />{e.correo}</span>
                <span>
                  <Chip clase={e.revocado_en ? 'c-idle' : vivo ? (dias <= 3 ? 'c-warn' : 'c-ok') : 'c-idle'}>
                    {e.revocado_en ? 'Revocada' : vivo ? `Activa · ${dias} d` : 'Caducada'}
                  </Chip>
                  {vivo && <div style={{ marginTop: 5 }}><BotonRevocar id={e.id} /></div>}
                </span>
                <span className="num">
                  {descargas}
                  {ultimo && (
                    <small className="tiny muted" style={{ display: 'block', fontWeight: 400 }}>
                      último: {fecha(ultimo)}
                    </small>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

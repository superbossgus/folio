import { contexto, envios, paquetes, fecha, fechaHora, nombreProducto } from '@/lib/datos';
import Chip from '@/components/Chip';
import BotonRevocar from '@/components/BotonRevocar';
import BotonPaquete from '@/components/BotonPaquete';

export const dynamic = 'force-dynamic';

export default async function Envios() {
  const { sb, rs } = await contexto();
  const [lista, paqs] = await Promise.all([
    envios(sb, rs!.id),
    paquetes(sb, rs!.id),
  ]);

  return (
    <>
      <h1>Envíos</h1>
      <p className="sub">
        Todo lo que salió de la bóveda y para quién. Las ligas caducan y
        registran cada apertura; los paquetes en zip no se pueden revocar,
        así que de esos queda al menos la constancia de qué llevaban.
      </p>

      <section>
        <h2>
          Ligas{' '}
          <span className="tiny muted" style={{ fontWeight: 400 }}>
            · caducan, se revocan y dicen quién las abrió
          </span>
        </h2>

        {lista.length === 0 ? (
          <div className="empty">
            <b>Sin ligas</b>
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
      </section>

      {/* Un zip que ya salió por correo no se puede apagar. Este registro es
          lo único que queda, y por eso no se puede editar ni borrar. */}
      <section>
        <h2>
          Paquetes en zip{' '}
          <span className="tiny muted" style={{ fontWeight: 400 }}>
            · armados desde la bóveda y mandados a mano
          </span>
        </h2>

        {paqs.length === 0 ? (
          <div className="empty">
            <b>Sin paquetes</b>
            En la bóveda, «Enviar información» arma un zip con lo que elijas y
            deja aquí el registro de a quién se lo mandaste.
          </div>
        ) : (
          <div className="rows">
            <div className="row head r-paq">
              <span>Paquete</span><span>Para</span>
              <span>Fecha y hora</span><span className="act">Acción</span>
            </div>
            {paqs.map((p: any) => {
              const items = (p.paquete_items ?? [])
                .map((i: any) => i.etiqueta).sort((a: string, b: string) => a.localeCompare(b, 'es'));
              const bajadas = p.paquete_descargas ?? [];
              const ultima = bajadas.length
                ? bajadas.map((d: any) => d.ocurrio_en).sort().at(-1) : null;
              return (
                <div className="row r-paq" key={p.id}>
                  <div className="name">
                    {p.archivo}
                    <small>
                      {items.length} documento{items.length === 1 ? '' : 's'}
                      {p.motivo ? ` · ${p.motivo}` : ''}
                      {p.marca_agua ? ' · con marca de agua' : ' · sin marca'}
                    </small>
                    <details style={{ marginTop: 3 }}>
                      <summary className="tiny muted" style={{ cursor: 'pointer' }}>
                        Qué llevaba
                      </summary>
                      <ul className="tiny muted" style={{ margin: '4px 0 0 16px', fontWeight: 400 }}>
                        {items.map((etiqueta: string) => <li key={etiqueta}>{etiqueta}</li>)}
                      </ul>
                    </details>
                  </div>
                  <span className="tiny muted">
                    {p.destinatario}
                    {p.organizacion && <><br />{p.organizacion}</>}
                    {p.correo && <><br />{p.correo}</>}
                  </span>
                  <span className="tiny muted">
                    {fechaHora(p.creado_en)}
                    <small className="tiny" style={{ display: 'block', marginTop: 2 }}>
                      {bajadas.length === 0
                        ? 'nunca se descargó'
                        : `${bajadas.length} descarga${bajadas.length > 1 ? 's' : ''} · última ${fechaHora(ultima)}`}
                    </small>
                  </span>
                  <span className="act">
                    <BotonPaquete paqueteId={p.id} archivo={p.archivo} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

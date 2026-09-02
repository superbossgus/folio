import { contexto } from '@/lib/datos';
import { salir } from '@/lib/acciones';
import Navegacion from '@/components/Navegacion';
import SelectorEmpresa from '@/components/SelectorEmpresa';

export default async function Marco({ children }: { children: React.ReactNode }) {
  const { sb, perfil, empresas, rs } = await contexto();

  if (!rs) {
    return (
      <div className="acceso">
        <div className="caja">
          <h1>Falta asignarte una empresa</h1>
          <p>
            Tu cuenta existe pero todavía no tiene acceso a ninguna razón social.
            Pídele a quien administra la cuenta que te agregue.
          </p>
          <form action={salir}><button className="btn">Salir</button></form>
        </div>
      </div>
    );
  }

  // Conteos para las insignias de la navegación.
  const [{ count: docs }, { count: tram }, { data: alertas }] = await Promise.all([
    sb.from('documentos').select('id', { count: 'exact', head: true })
      .eq('razon_social_id', rs.id).eq('archivado', false),
    sb.from('tramites').select('id', { count: 'exact', head: true })
      .eq('razon_social_id', rs.id).not('etapa', 'in', '(contratado,declinado,cancelado)'),
    sb.from('v_agenda').select('clase').eq('razon_social_id', rs.id).lte('dias', 20),
  ]);

  const iniciales = (perfil?.nombre ?? '?')
    .split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase();

  return (
    <>
      <div className="shell">
        <aside className="rail">
          <div className="brand"><b>Folio</b><span>bóveda</span></div>
          <Navegacion docs={docs ?? 0} tramites={tram ?? 0} alertas={alertas?.length ?? 0} />
          <div className="railfoot">
            {perfil?.nombre}<br />
            <form action={salir}><button type="submit">Cerrar sesión</button></form>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <SelectorEmpresa empresas={empresas} activa={rs.id} />
            <span className="rfc">{rs.rfc}</span>
            <div className="sp" />
            <div className="who">
              <span className="avatar">{iniciales}</span>
              <span>{perfil?.nombre}</span>
            </div>
          </header>
          <div className="view">{children}</div>
        </div>
      </div>
      <Navegacion movil docs={docs ?? 0} tramites={tram ?? 0} alertas={alertas?.length ?? 0} />
    </>
  );
}

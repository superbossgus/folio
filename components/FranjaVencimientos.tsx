const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

/* La fecha límite es lo más característico de este trabajo, así que es
   lo primero que se ve. Cada marca es un vencimiento real. */
export default function FranjaVencimientos({ eventos }: { eventos: any[] }) {
  const lo = -20, hi = 90, span = hi - lo;
  const dentro = eventos.filter(e => e.dias != null && e.dias <= hi);

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const meses: { texto: string; pos: number }[] = [];
  let cur = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  for (let i = 0; i < 3; i++) {
    const off = Math.round((+cur - +hoy) / 86400000);
    if (off <= hi - 4) meses.push({ texto: `1 ${MES[cur.getMonth()]}`, pos: ((off - lo) / span) * 100 });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const marca = (e: any) => {
    if (e.clase === 'obligacion') return { alto: 58, clase: 't-brand' };
    if (e.clase === 'envio')      return { alto: 26, clase: 't-ok' };
    if (e.dias < 0)               return { alto: 58, clase: 't-risk' };
    if (e.dias <= 20)             return { alto: 46, clase: 't-warn' };
    return { alto: 32, clase: 't-ok' };
  };

  return (
    <div className="strip">
      <div className="strip-h">
        <h2>Próximos 90 días</h2>
        <span className="tiny muted">{dentro.length} fechas por atender</span>
      </div>
      <div className="track">
        {meses.map(m => (
          <span className="month" key={m.texto} style={{ left: `${m.pos}%` }}>{m.texto}</span>
        ))}
        {dentro.map((e, i) => {
          const m = marca(e);
          const pos = ((Math.max(lo, Math.min(hi, e.dias)) - lo) / span) * 100;
          return (
            <span key={`${e.clase}-${e.origen_id}-${i}`}
                  className={`tick ${m.clase}`}
                  style={{ left: `${pos}%`, height: m.alto }}
                  title={`${e.titulo}${e.detalle ? ' · ' + e.detalle : ''}`} />
          );
        })}
        <span className="now" style={{ left: `${((0 - lo) / span) * 100}%` }} />
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--risk)' }} />Documento vencido</span>
        <span><i style={{ background: 'var(--warn)' }} />Por vencer</span>
        <span><i style={{ background: 'var(--brand)' }} />Obligación con la institución</span>
        <span><i style={{ background: '#9FB3AC' }} />Vigente o liga de envío</span>
      </div>
    </div>
  );
}

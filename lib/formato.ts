/* Formato y catálogos. Sin dependencias de servidor: lo usan tanto las
   páginas como los componentes del navegador. */

/* ---------------------------------------------------------------- formato */

const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

export function fecha(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
}

/* La hora siempre en el centro de México, no en la del servidor. Un
   paquete que se armó a las 14:22 tiene que decir 14:22 aunque la página
   se dibuje en una máquina que cree estar en UTC, porque el usuario la va
   a comparar contra la hora del correo que mandó. */
export const ZONA = 'America/Mexico_City';

export function fechaHora(iso?: string | null) {
  if (!iso) return '—';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find(x => x.type === t)?.value ?? '';
  return `${Number(p('day'))} ${MES[Number(p('month')) - 1]} ${p('year')}, ${p('hour')}:${p('minute')}`;
}

export function pesos(n?: number | null) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

export function etiquetaVigencia(estado: string, dias: number | null) {
  switch (estado) {
    case 'vencido':    return { texto: dias == null ? 'Vencido' : `Venció hace ${-dias} d`, clase: 'c-risk' };
    case 'por_vencer': return { texto: `Vence en ${dias} d`, clase: 'c-warn' };
    case 'vigente':    return { texto: dias == null ? 'Vigente' : `Vence en ${dias} d`, clase: 'c-ok' };
    case 'permanente': return { texto: 'Sin vencimiento', clase: 'c-idle' };
    case 'falta':      return { texto: 'Sin archivo', clase: 'c-idle' };
    default:           return { texto: 'Pendiente', clase: 'c-idle' };
  }
}

export const ETAPAS = [
  { clave: 'prospeccion',  nombre: 'Prospección' },
  { clave: 'integracion',  nombre: 'Integración de expediente' },
  { clave: 'mesa_credito', nombre: 'Mesa de crédito' },
  { clave: 'aprobado',     nombre: 'Aprobado, pendiente de firma' },
  { clave: 'contratado',   nombre: 'Contratado' },
];

export const PRODUCTOS = [
  { clave: 'credito_simple',           nombre: 'Crédito simple' },
  { clave: 'credito_revolvente',       nombre: 'Crédito revolvente' },
  { clave: 'credito_cuenta_corriente', nombre: 'Crédito en cuenta corriente' },
  { clave: 'factoraje',                nombre: 'Línea de factoraje' },
  { clave: 'arrendamiento_puro',       nombre: 'Arrendamiento puro' },
  { clave: 'arrendamiento_financiero', nombre: 'Arrendamiento financiero' },
  { clave: 'carta_credito',            nombre: 'Carta de crédito' },
];

export const nombreEtapa   = (c: string) => ETAPAS.find(e => e.clave === c)?.nombre ?? c;
export const nombreProducto = (c: string) => PRODUCTOS.find(p => p.clave === c)?.nombre ?? c;

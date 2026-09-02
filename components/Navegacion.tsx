'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const VISTAS = [
  { ruta: '/panel',     nombre: 'Panel',     icono: '◧' },
  { ruta: '/boveda',    nombre: 'Bóveda',    icono: '▤' },
  { ruta: '/tramites',  nombre: 'Trámites',  icono: '◈' },
  { ruta: '/contratos', nombre: 'Contratos', icono: '§' },
  { ruta: '/envios',    nombre: 'Envíos',    icono: '↗' },
];

export default function Navegacion(
  { docs, tramites, alertas, movil }:
  { docs: number; tramites: number; alertas: number; movil?: boolean }
) {
  const aqui = usePathname();
  const activa = (r: string) => aqui === r || aqui.startsWith(r + '/');

  const insignia = (r: string) => {
    if (r === '/panel' && alertas)    return <span className="n alert">{alertas}</span>;
    if (r === '/boveda' && docs)      return <span className="n">{docs}</span>;
    if (r === '/tramites' && tramites) return <span className="n">{tramites}</span>;
    return null;
  };

  if (movil) {
    return (
      <nav className="mobnav">
        {VISTAS.map(v => (
          <Link key={v.ruta} href={v.ruta} className={activa(v.ruta) ? 'on' : ''}>
            <b>{v.icono}</b>{v.nombre}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="nav">
      {VISTAS.map(v => (
        <Link key={v.ruta} href={v.ruta} className={activa(v.ruta) ? 'on' : ''}>
          <span>{v.nombre}</span>{insignia(v.ruta)}
        </Link>
      ))}
    </nav>
  );
}

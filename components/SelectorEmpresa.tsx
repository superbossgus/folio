'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cambiarRazonSocial } from '@/lib/acciones';

export default function SelectorEmpresa(
  { empresas, activa }: { empresas: any[]; activa: string }
) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  return (
    <div className="entity">
      <select
        aria-label="Razón social"
        value={activa}
        disabled={pendiente}
        onChange={e => empezar(async () => {
          await cambiarRazonSocial(e.target.value);
          router.refresh();
        })}
      >
        {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </select>
    </div>
  );
}

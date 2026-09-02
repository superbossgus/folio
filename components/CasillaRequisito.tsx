'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { marcarRequisito } from '@/lib/acciones';

/* Un requisito que viene de la bóveda no se marca a mano: lo resuelve el
   documento. Dejar que alguien lo palomee sin archivo es exactamente
   cómo se llega a una mesa de crédito con el expediente incompleto. */
export default function CasillaRequisito(
  { id, marcado, bloqueado }: { id: string; marcado: boolean; bloqueado: boolean }
) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [aviso, setAviso] = useState('');

  function alternar() {
    if (bloqueado) {
      setAviso('Lo resuelve el documento de la bóveda.');
      setTimeout(() => setAviso(''), 2500);
      return;
    }
    empezar(async () => {
      await marcarRequisito(id, marcado ? 'pendiente' : 'cubierto');
      router.refresh();
    });
  }

  return (
    <span
      className={`cbx${marcado ? ' on' : ''}`}
      role="checkbox"
      aria-checked={marcado}
      aria-label={bloqueado ? 'Resuelto por la bóveda' : 'Marcar requisito'}
      tabIndex={0}
      title={aviso || undefined}
      style={pendiente ? { opacity: 0.5 } : undefined}
      onClick={alternar}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar(); } }}
    >
      {marcado ? '✓' : ''}
    </span>
  );
}

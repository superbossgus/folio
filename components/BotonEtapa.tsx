'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { avanzarEtapa } from '@/lib/acciones';

export default function BotonEtapa({ tramiteId, etapa }: { tramiteId: string; etapa: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState('');

  return (
    <>
      <button className="btn" disabled={pendiente || etapa === 'Contratado'}
        onClick={() => empezar(async () => {
          setError('');
          const r = await avanzarEtapa(tramiteId);
          if (r.error) setError(r.error); else router.refresh();
        })}>
        {pendiente ? 'Actualizando…' : 'Avanzar etapa'}
      </button>
      {error && <div className="aviso" style={{ width: '100%', margin: 0 }}>{error}</div>}
    </>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cumplirObligacion } from '@/lib/acciones';

export default function BotonObligacion({ id }: { id: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState('');

  return (
    <>
      <button className="btn sm" disabled={pendiente}
        onClick={() => empezar(async () => {
          const r = await cumplirObligacion(id);
          if (r.error) setError(r.error); else router.refresh();
        })}>
        {pendiente ? 'Guardando…' : 'Marcar cumplida'}
      </button>
      {error && <div className="tiny" style={{ color: 'var(--risk)' }}>{error}</div>}
    </>
  );
}

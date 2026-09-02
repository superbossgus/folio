'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { revocarEnvio } from '@/lib/acciones';

export default function BotonRevocar({ id }: { id: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <button className="btn sm" disabled={pendiente}
      onClick={() => empezar(async () => { await revocarEnvio(id); router.refresh(); })}>
      {pendiente ? 'Revocando…' : 'Revocar'}
    </button>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bajarPaquete } from '@/lib/paquete-navegador';

/* Vuelve a armar el zip de un paquete ya registrado. Sale idéntico al de
   la primera vez —las versiones quedaron selladas en el renglón— y cada
   descarga suma un renglón más a la bitácora. */
export default function BotonPaquete(
  { paqueteId, archivo }: { paqueteId: string; archivo: string }
) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState('');

  return (
    <>
      <button className="btn sm" disabled={pendiente} onClick={() => empezar(async () => {
        setError('');
        try {
          await bajarPaquete(paqueteId, archivo);
          router.refresh();
        } catch (e: any) {
          setError(e.message ?? 'No se pudo armar el zip.');
        }
      })}>
        {pendiente ? 'Armando…' : 'Descargar'}
      </button>
      {error && (
        <small className="tiny" style={{ display: 'block', marginTop: 3, color: 'var(--risk)' }}>
          {error}
        </small>
      )}
    </>
  );
}

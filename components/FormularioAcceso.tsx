'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase-navegador';

export default function FormularioAcceso() {
  const router = useRouter();
  const params = useSearchParams();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function acceder(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setOcupado(true);
    const sb = supabaseNavegador();

    const { error: err } = await sb.auth.signInWithPassword({ email: correo, password: clave });
    if (err) {
      // Mensaje deliberadamente vago: decir cuál de los dos está mal
      // le regala a un atacante la lista de correos válidos.
      setError('Correo o contraseña incorrectos.');
      setOcupado(false);
      return;
    }

    // ¿La cuenta trae segundo factor pendiente?
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      const { data: factores } = await sb.auth.mfa.listFactors();
      const totp = factores?.totp?.[0];
      if (totp) { setFactorId(totp.id); setOcupado(false); return; }
    }
    router.push(params.get('regresar') || '/panel');
    router.refresh();
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setOcupado(true);
    const sb = supabaseNavegador();
    const { data: reto, error: e1 } = await sb.auth.mfa.challenge({ factorId: factorId! });
    if (e1) { setError('No se pudo iniciar la verificación.'); setOcupado(false); return; }
    const { error: e2 } = await sb.auth.mfa.verify({
      factorId: factorId!, challengeId: reto.id, code: codigo,
    });
    if (e2) { setError('Código incorrecto o vencido.'); setOcupado(false); return; }
    router.push(params.get('regresar') || '/panel');
    router.refresh();
  }

  return (
    <div className="acceso">
      <div className="caja">
        <h1>Folio</h1>
        <p>Expedientes para trámites de crédito, factoraje y arrendamiento.</p>

        {error && <div className="aviso">{error}</div>}

        {!factorId ? (
          <form onSubmit={acceder} className={ocupado ? 'spin' : ''}>
            <div className="field">
              <label htmlFor="correo">Correo</label>
              <input id="correo" type="email" autoComplete="username" required
                     value={correo} onChange={e => setCorreo(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="clave">Contraseña</label>
              <input id="clave" type="password" autoComplete="current-password" required
                     value={clave} onChange={e => setClave(e.target.value)} />
            </div>
            <div style={{ marginTop: 20 }}>
              <button className="btn pri" style={{ width: '100%' }} disabled={ocupado}>
                {ocupado ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verificar} className={ocupado ? 'spin' : ''}>
            <div className="field">
              <label htmlFor="codigo">Código de tu aplicación de autenticación</label>
              <input id="codigo" inputMode="numeric" autoComplete="one-time-code"
                     maxLength={6} required value={codigo}
                     onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div style={{ marginTop: 20 }}>
              <button className="btn pri" style={{ width: '100%' }} disabled={ocupado}>Verificar</button>
            </div>
          </form>
        )}

        <p className="tiny muted" style={{ marginTop: 18, marginBottom: 0 }}>
          Las cuentas se crean por invitación. Si no tienes uno, pídeselo a
          quien administra la cuenta de tu empresa.
        </p>
      </div>
    </div>
  );
}

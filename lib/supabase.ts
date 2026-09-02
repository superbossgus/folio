import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Cliente para componentes de servidor y acciones. Lleva la sesión del
 *  usuario, así que todas las consultas pasan por las políticas de
 *  seguridad a nivel de renglón. Es el que se usa casi siempre. */
export async function supabaseServidor() {
  const galletas = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => galletas.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => galletas.set(name, value, options));
        } catch {
          // Los componentes de servidor no pueden escribir cookies. El
          // middleware ya refrescó la sesión, así que se puede ignorar.
        }
      },
    },
  });
}

/** Cliente con permisos totales. Se salta la seguridad a nivel de renglón,
 *  así que solo se usa donde no hay sesión de usuario: la página pública
 *  de una liga de envío y la revisión antivirus. Nunca en el navegador. */
export function supabaseAdmin() {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!llave) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return createClient(URL, llave, { auth: { persistSession: false } });
}

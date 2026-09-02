'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Cliente del navegador. Vive aparte del cliente de servidor porque
 *  aquel importa next/headers, que no existe en el navegador. */
export function supabaseNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

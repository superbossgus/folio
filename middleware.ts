import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/* Refresca la sesión en cada petición y bloquea todo lo que no sea la
   pantalla de acceso o una liga pública de envío. Es la primera barrera;
   la segunda son las políticas de la base de datos. */
export async function middleware(peticion: NextRequest) {
  let respuesta = NextResponse.next({ request: peticion });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => peticion.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => peticion.cookies.set(name, value));
          respuesta = NextResponse.next({ request: peticion });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await sb.auth.getUser();
  const ruta = peticion.nextUrl.pathname;
  const publica = ruta.startsWith('/entrar') || ruta.startsWith('/l/') || ruta.startsWith('/api/webhook');

  if (!user && !publica) {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/entrar';
    destino.searchParams.set('regresar', ruta);
    return NextResponse.redirect(destino);
  }
  if (user && ruta === '/entrar') {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/panel';
    destino.search = '';
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

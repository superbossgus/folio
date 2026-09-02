import { Suspense } from 'react';
import FormularioAcceso from '@/components/FormularioAcceso';

/* El formulario lee la ruta de regreso de la barra de direcciones, así que
   necesita renderizarse en el navegador. La envoltura evita que Next
   intente resolverlo al compilar. */
export default function Entrar() {
  return (
    <Suspense fallback={<div className="acceso"><div className="caja"><h1>Folio</h1></div></div>}>
      <FormularioAcceso />
    </Suspense>
  );
}

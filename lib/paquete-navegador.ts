'use client';

/** Baja el zip de un paquete ya registrado. Se pide con fetch y no con un
 *  enlace directo para poder enseñar el error dentro de la pantalla: si el
 *  almacén falla, el usuario tiene que enterarse ahí y no en una pestaña
 *  en blanco creyendo que el archivo ya salió. */
export async function bajarPaquete(paqueteId: string, nombre: string) {
  const respuesta = await fetch(`/api/paquetes/${paqueteId}/zip`);
  if (!respuesta.ok) {
    throw new Error(await respuesta.text() || 'No se pudo armar el zip.');
  }

  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

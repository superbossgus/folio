'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase-navegador';
import { registrarDocumento } from '@/lib/acciones';

/* El archivo NO pasa por el servidor de la aplicación: se pide una URL
   firmada y el navegador sube directo al almacén privado. Menos saltos,
   menos lugares donde una copia se pueda quedar olvidada. */

async function sha256(archivo: File) {
  const buffer = await archivo.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function SubirDocumento(
  { razonSocialId, tipos, documentos, renovar }:
  { razonSocialId: string; tipos: any[]; documentos: any[]; renovar?: any }
) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [nombre, setNombre] = useState('');
  const [folio, setFolio] = useState('');
  const [emitido, setEmitido] = useState(new Date().toISOString().slice(0, 10));
  const archivoRef = useRef<HTMLInputElement>(null);

  const yaCargados = new Set(documentos.map((d: any) => d.clave));
  const disponibles = renovar ? tipos : tipos.filter(t => !yaCargados.has(t.clave));

  function abrir() {
    setError('');
    setTipoId(renovar ? (tipos.find(t => t.clave === renovar.clave)?.id ?? '') : (disponibles[0]?.id ?? ''));
    setNombre(renovar?.nombre ?? '');
    setFolio(renovar?.folio ?? '');
    setEmitido(new Date().toISOString().slice(0, 10));
    setAbierto(true);
  }

  async function guardar() {
    const archivo = archivoRef.current?.files?.[0];
    if (!archivo) { setError('Elige el archivo.'); return; }
    if (archivo.size > 50 * 1024 * 1024) { setError('El archivo pasa de 50 MB.'); return; }
    if (!renovar && !tipoId) { setError('Elige el tipo de documento.'); return; }

    setOcupado(true); setError('');
    try {
      const sb = supabaseNavegador();
      const documentoId = renovar?.documento_id;
      const carpeta = documentoId ?? crypto.randomUUID();
      const version = renovar ? (renovar.version ?? 0) + 1 : 1;
      const extension = archivo.name.split('.').pop()?.toLowerCase() || 'pdf';
      const ruta = `${razonSocialId}/${carpeta}/${version}.${extension}`;

      const { error: errSubida } = await sb.storage.from('documentos')
        .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
      if (errSubida) throw new Error('No se pudo subir el archivo: ' + errSubida.message);

      const resultado = await registrarDocumento({
        razonSocialId,
        tipoDocumentoId: tipoId,
        nombre: nombre || tipos.find(t => t.id === tipoId)?.nombre || archivo.name,
        folio, emitido, ruta,
        sha256: await sha256(archivo),
        bytes: archivo.size,
        mime: archivo.type || 'application/pdf',
        documentoId,
      });

      if (resultado.error) throw new Error(resultado.error);
      setAbierto(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Algo falló al guardar.');
    } finally {
      setOcupado(false);
    }
  }

  if (!abierto) {
    return renovar
      ? <button className="btn sm" onClick={abrir}>Renovar</button>
      : <button className="btn pri" onClick={abrir}>Agregar documento</button>;
  }

  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
      <div className={`modal${ocupado ? ' spin' : ''}`}>
        <h3>{renovar ? `Renovar ${renovar.nombre}` : 'Agregar documento a la bóveda'}</h3>
        <p className="tiny muted">
          {renovar
            ? 'La versión anterior no se borra: queda como prueba de qué recibió cada institución.'
            : 'En cuanto pase la revisión, los trámites abiertos que lo pidan lo toman solos.'}
        </p>

        {error && <div className="aviso" style={{ marginTop: 12 }}>{error}</div>}

        {!renovar && (
          <>
            <div className="field">
              <label htmlFor="tipo">Tipo de documento</label>
              <select id="tipo" value={tipoId} onChange={e => {
                setTipoId(e.target.value);
                setNombre(tipos.find(t => t.id === e.target.value)?.nombre ?? '');
              }}>
                {disponibles.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}{t.vigencia_dias ? ` · ${t.vigencia_dias} días` : ' · sin vencimiento'}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nombre">Nombre</label>
              <input id="nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="folio">Folio o escritura (opcional)</label>
              <input id="folio" value={folio} onChange={e => setFolio(e.target.value)}
                     placeholder="Esc. 45,872 · Not. 12" />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="emitido">Fecha de emisión del documento</label>
          <input id="emitido" type="date" value={emitido} max={new Date().toISOString().slice(0, 10)}
                 onChange={e => setEmitido(e.target.value)} />
          <span className="tiny muted">
            La del documento, no la de hoy. De aquí sale la antigüedad que revisa cada banco.
          </span>
        </div>

        <div className="field">
          <label htmlFor="archivo">Archivo</label>
          <input id="archivo" ref={archivoRef} type="file"
                 accept="application/pdf,image/jpeg,image/png" />
        </div>

        <div className="mfoot">
          <button className="btn" onClick={() => setAbierto(false)} disabled={ocupado}>Cancelar</button>
          <button className="btn pri" onClick={guardar} disabled={ocupado}>
            {ocupado ? 'Subiendo…' : 'Guardar en la bóveda'}
          </button>
        </div>
      </div>
    </div>
  );
}

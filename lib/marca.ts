import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

/* La marca de agua se imprime en cada entrega y nunca se guarda una copia
   marcada. Vive aquí y no dentro de cada ruta porque se usa en los dos
   caminos por los que un documento sale de la bóveda —la liga pública y el
   zip— y las dos tienen que imprimir exactamente lo mismo. Si un archivo
   aparece filtrado, el texto dice a quién se le entregó y cuándo. */
export async function marcarPdf(bytes: Uint8Array, marca: string): Promise<Uint8Array> {
  try {
    const pdf = await PDFDocument.load(bytes);
    const tipografia = await pdf.embedFont(StandardFonts.Helvetica);

    for (const pagina of pdf.getPages()) {
      const { width, height } = pagina.getSize();
      pagina.drawText(marca, {
        x: width * 0.08,
        y: height * 0.25,
        size: Math.max(14, Math.min(26, width / 22)),
        font: tipografia,
        color: rgb(0.55, 0.6, 0.63),
        opacity: 0.28,
        rotate: degrees(32),
      });
      pagina.drawText(marca, {
        x: 28, y: 18, size: 7, font: tipografia,
        color: rgb(0.42, 0.47, 0.5), opacity: 0.75,
      });
    }

    return await pdf.save();
  } catch {
    // Un PDF cifrado o corrupto no debe tumbar la entrega: se devuelve sin
    // marca. El registro del acceso ya quedó de todos modos.
    return bytes;
  }
}

import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Folio · expedientes para trámites de crédito',
  description: 'Una sola fuente de documentos para todas las instituciones financieras.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}

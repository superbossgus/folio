# Folio

Bóveda de documentos y seguimiento de trámites ante instituciones
financieras: crédito, factoraje y arrendamiento. Un documento se carga una
vez y alimenta todas las solicitudes abiertas.

Next.js 15 · React 19 · Supabase · TypeScript

---

## Idea central

El producto no es un archivero. Son tres cosas que un archivo compartido
nunca va a poder hacer:

1. **Una sola fuente.** El documento vive en la bóveda. Cuando se abre un
   trámite, el checklist se arma solo y toma de ahí lo que ya existe
   vigente. Cuando se renueva, se actualiza en todas las instituciones a la
   vez.
2. **La vigencia depende de quién pregunta.** BBVA acepta comprobantes de
   domicilio de 60 días y Banorte de 90. El mismo archivo puede estar
   vigente en un banco y vencido en otro, y el sistema lo dice antes de que
   el analista lo rechace.
3. **Entrega con trazabilidad.** No se mandan adjuntos: se manda una liga
   con caducidad y marca de agua a nombre de quien la recibe, y queda
   registro de cada apertura y descarga.

La lógica vive en Postgres, no aquí. Las vistas y funciones de `vistas.sql`
son la única implementación de las reglas; esta aplicación las consulta.
Así, cuando exista app móvil o una integración, no habrá dos versiones de
la verdad que se contradigan.

---

## Instalar

```bash
npm install
cp .env.example .env.local     # y llenar con los datos del proyecto Supabase
npm run dev
```

Antes hay que cargar la base, en este orden:

1. `esquema.sql` — tablas, políticas de seguridad, catálogos y almacén
2. `vistas.sql` — vistas y operaciones que consume la aplicación

Los pasos completos, incluida la configuración de acceso y la revisión de
seguridad previa al primer archivo real, están en `runbook.md`.

## Variables de entorno

| Variable | Dónde vive | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador y servidor | dirección del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador y servidor | sesión del usuario |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | ligas públicas y antivirus |
| `WEBHOOK_ANTIVIRUS_SECRET` | solo servidor | autentica al servicio de revisión |
| `RESEND_API_KEY` | solo servidor | correo saliente |
| `CORREO_REMITENTE` | solo servidor | de quién sale el correo |
| `NEXT_PUBLIC_URL_BASE` | navegador y servidor | la dirección que va dentro del correo |

La llave de servicio se salta la seguridad a nivel de renglón. Si alguna vez
aparece con el prefijo `NEXT_PUBLIC_`, cualquiera puede leer los expedientes
de todos los clientes. No hay excepción a esa regla.

---

## Cómo está organizado

```
app/
  entrar/                 acceso con correo, contraseña y segundo factor
  (sistema)/              todo lo que exige sesión
    panel/                vencimientos, obligaciones y trámites abiertos
    boveda/               documentos, versiones y matriz de reglas
    tramites/[id]/        requisitos evaluados con la regla de esa institución
    contratos/            créditos vigentes y obligaciones posteriores a la firma
    envios/               ligas emitidas y su bitácora de accesos
  l/[token]/              página pública de una liga; la única sin sesión
  api/webhook/antivirus/  resultado de la revisión de archivos
lib/
  supabase.ts             clientes de servidor y de servicio
  supabase-navegador.ts   cliente del navegador
  datos.ts                sesión, razón social activa y consultas
  formato.ts              fechas, montos y catálogos
  acciones.ts             acciones de servidor
```

### Decisiones que conviene no deshacer

**El filtrado por empresa no está en este código.** Las consultas no llevan
condiciones de pertenencia porque las políticas de la base ya las imponen.
Es deliberado: un descuido aquí no abre la puerta. Si alguien alguna vez
agrega un `where razon_social_id = ...` "por seguridad", está duplicando una
regla que ya existe y que puede quedar desincronizada.

**Los archivos no pasan por el servidor.** El navegador pide una URL firmada
y sube directo al almacén privado. Menos saltos y ningún lugar intermedio
donde una copia se quede olvidada.

**Las versiones se apilan, nunca se sobrescriben.** Si un banco descargó la
versión 1, tiene que poderse demostrar exactamente qué recibió. Por eso no
hay permisos de modificación ni de borrado sobre `documento_versiones`, ni
siquiera para el dueño de la cuenta.

**La marca de agua se imprime en cada descarga.** Nunca se guarda una copia
marcada. Si un documento aparece filtrado, el texto impreso dice a quién se
le entregó y cuándo.

**El correo lleva la liga, nunca los archivos.** Un adjunto se reenvía, se
queda en bandejas ajenas y no se puede revocar. La liga caduca, se puede
apagar y registra quién la abrió. Si el proveedor de correo falla, la liga
se muestra igual para copiarla a mano: el trabajo no se detiene porque un
servicio de terceros esté caído.

**El token de una liga solo se muestra una vez.** En la base queda su huella
criptográfica. Si se pierde, se genera otro envío; no hay forma de
recuperarlo, y eso es correcto.

---

## Lo que falta

Esto está construido y compila, pero no es un producto terminado. En orden
de importancia:

- **Recordatorios automáticos.** Una tarea diaria que recorra `v_agenda` y
  avise de vencimientos y obligaciones. Sin esto el producto pierde la mitad
  de su valor, porque nadie entra todos los días.
- **Revisión antivirus real.** El webhook existe; falta el servicio que lo
  llame. Mientras tanto, las versiones nacen pendientes y no se pueden
  enviar.
- **Administración de usuarios desde la interfaz.** Hoy las invitaciones y
  los roles se cargan con SQL.
- **Editor de reglas de vigencia.** La matriz se muestra pero no se edita.
  Es de lo primero que va a pedir un cliente cuando su ejecutivo le acepte
  algo distinto a lo que dice el catálogo.
- **Cobro y suscripciones.** Ver la nota sobre tiendas de aplicaciones en
  `runbook.md`: conviene cobrar en la web y dejar la app móvil como cliente.

Las reglas de vigencia que trae el catálogo son **plausibles pero
inventadas**. Hay que validarlas institución por institución antes de
enseñarle esto a un cliente, y anotar la fuente de cada una.

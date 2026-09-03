# Folio · cómo ponerlo en línea y empezar a usarlo

Este documento asume que alguien con acceso a las cuentas va a ejecutar los
pasos. Yo escribí el esquema y lo probé contra Postgres 16, pero no puedo
crear cuentas ni publicar nada por ti.

---

## Antes de empezar

Necesitas tres cuentas y unos 700 pesos al mes:

| Servicio | Para qué | Costo |
|---|---|---|
| Supabase | Base de datos, usuarios y archivos | Gratis para probar · unos 500 MXN/mes en producción |
| Vercel | Publicar la aplicación web | Gratis para empezar · unos 400 MXN/mes con equipo |
| Dominio | `folio.tuempresa.mx` | 200 a 400 MXN al año |

Elige la región **East US (Ohio)** o **South America (São Paulo)** en Supabase.
No hay región en México. Esto importa para la LFPDPPP: la transferencia
internacional es válida, pero tu aviso de privacidad tiene que declararla.

---

## Paso 1 · Crear el proyecto

En supabase.com, nuevo proyecto. Guarda la contraseña de la base de datos en
un gestor de contraseñas, no en un correo. Si la pierdes, se regenera, pero
vas a perder tiempo.

Anota tres cosas del panel, en Settings → API:

- `Project URL`
- `anon key` — se usa en el navegador, es pública por diseño
- `service_role key` — **nunca** debe aparecer en código de cliente ni en
  un repositorio. Solo en variables de entorno del servidor.

## Paso 2 · Cargar el esquema

SQL Editor → New query → pega el contenido completo de `esquema.sql` → Run.

Debe terminar sin errores. Si algo falla, no sigas: revisa el mensaje antes
de continuar, porque los pasos siguientes dependen de que las políticas de
seguridad hayan quedado creadas.

Para comprobar que quedó bien, corre esto:

```sql
select tablename, rowsecurity
from pg_tables where schemaname='public'
order by rowsecurity, tablename;
```

Toda tabla debe decir `true`. Si alguna dice `false`, esa tabla está expuesta.

Si ya habías cargado el esquema antes de que existieran los paquetes en zip,
corre además `migracion-02-paquetes.sql` y vuelve a ejecutar `vistas.sql`. Si
cargaste todo hoy, ignóralo: ya viene incluido.

## Paso 3 · Configurar el acceso

Authentication → Providers: deja solo **Email**. Apaga los demás por ahora.

Authentication → Settings:

- Apaga **Enable email signups**. Nadie debe poder crearse una cuenta solo.
  El alta es por invitación, siempre. Es una aplicación de empresa, no una red
  social.
- Longitud mínima de contraseña: 12 caracteres.
- Activa **MFA (TOTP)**. Para los roles `propietario` y `administrador` debe
  ser obligatorio, no opcional. La aplicación lo verifica con el campo
  `perfiles.mfa_obligatorio`.
- Vigencia del token de sesión: 8 horas. Es un sistema con documentos
  sensibles, no conviene la sesión eterna.

## Paso 4 · Verificar el almacén de archivos

Storage → debe existir un bucket `documentos` con el candado de privado.
El script ya lo crea. Si aparece como público, bórralo y vuelve a correr
esa sección: un bucket público significa que cualquiera con la URL puede
bajar el acta constitutiva de tus clientes.

## Paso 5 · Crear tu propia cuenta

Primero invítate desde Authentication → Users → Invite. Copia el `id` que
te asigne y sustitúyelo abajo.

```sql
-- reemplaza el uuid por el tuyo y los datos por los reales
insert into perfiles (id, nombre, correo, mfa_obligatorio)
values ('TU-UUID-AQUI', 'Tu nombre', 'tu@correo.mx', true);

insert into organizaciones (id, nombre, plan)
values (gen_random_uuid(), 'Tu grupo empresarial', 'profesional')
returning id;  -- guarda este id

insert into razones_sociales (organizacion_id, nombre, rfc)
values ('ID-DE-LA-ORGANIZACION', 'Razón social completa, S.A. de C.V.', 'RFC123456ABC');

insert into membresias (organizacion_id, perfil_id, rol)
values ('ID-DE-LA-ORGANIZACION', 'TU-UUID-AQUI', 'propietario');
```

Para invitar a tu equipo, repite `perfiles` y `membresias` con el rol que
corresponda. Si alguien solo debe ver una empresa del grupo, pon su
`razon_social_id` en la membresía en lugar de dejarlo nulo.

Los roles significan esto:

- **propietario** — todo, incluido facturación y borrar la cuenta
- **administrador** — todo el contenido, invita gente, edita reglas
- **capturista** — carga documentos, arma trámites, manda envíos
- **lectura** — ve, no toca
- **auditor** — ve, no toca, y ve la bitácora completa

## Paso 6 · La aplicación

Esta parte todavía no existe. El prototipo `folio.html` es la interfaz y el
comportamiento, pero corre contra datos en el navegador. Falta conectarla.

Lo que hay que construir, en orden de dependencia:

1. **Pantalla de acceso** con correo y contraseña, más el segundo factor.
2. **Carga de archivos.** El navegador pide una URL firmada al servidor, sube
   directo al bucket en la ruta `{razon_social_id}/{documento_id}/{version}.pdf`,
   y luego registra el renglón en `documento_versiones` con el hash del
   archivo. El hash sirve para detectar que alguien vuelva a subir el mismo
   documento sin cambios.
3. **Revisión antivirus.** La versión nace en estado `pendiente` y no se puede
   enviar hasta quedar `limpio`. Un webhook de Supabase que llame a ClamAV o a
   un servicio equivalente.
4. **Ligas de envío.** Se genera un token aleatorio, se guarda solo su hash en
   `envios.token_hash`, y el token en claro se manda por correo. Quien abra la
   liga entra a una página pública que valida el token, revisa la fecha de
   caducidad, registra el acceso en `envio_accesos` y sirve el PDF con la
   marca de agua impresa encima.
5. **Marca de agua.** Se genera al vuelo con el nombre del destinatario, su
   correo y la fecha. Nunca se guarda una copia con marca de agua: se produce
   en cada descarga.
6. **Recordatorios.** Una tarea diaria que revisa vencimientos y obligaciones
   y manda correo. Sin esto el producto pierde la mitad de su valor, porque
   nadie entra a la aplicación todos los días.

Los puntos 1 y 2 ya te permiten empezar a usarlo internamente. Los demás
pueden esperar.

## Paso 7 · Publicar

Vercel, conectado al repositorio. Variables de entorno:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   ← solo servidor, jamás con NEXT_PUBLIC_
```

Apunta el dominio, verifica que el certificado quede activo y prueba desde
un celular antes de invitar a nadie.

---

## Revisión antes del primer archivo real

No subas un solo documento verdadero hasta que todo esto esté palomeado:

- [ ] Toda tabla con `rowsecurity = true`
- [ ] Bucket `documentos` privado
- [ ] Alta pública de usuarios desactivada
- [ ] MFA activo en las cuentas de administrador
- [ ] `service_role key` fuera del código del navegador y fuera del repositorio
- [ ] Respaldos diarios activos, con retención de 30 días
- [ ] Probado con dos cuentas distintas que una no ve los datos de la otra
- [ ] Aviso de privacidad publicado
- [ ] Consentimiento expreso y por escrito de avales y accionistas cuyos datos
      vas a guardar. Son datos financieros: el consentimiento tácito no basta.

Ese último punto no es trámite. La ley vigente desde el 21 de marzo de 2025
puso la vigilancia en la Secretaría Anticorrupción y Buen Gobierno, y las
multas por datos sensibles se duplican. Si vas a vender el sistema a otras
empresas, además vas a necesitar un contrato de encargado del tratamiento con
cada cliente. Eso lo revisa un abogado, no yo.

---

## Cómo arrancar con tu equipo

**Semana 1 · Captura las reglas reales.**
Siéntate con quien lleva los trámites. Abran el prototipo juntos, vayan a la
matriz del final de la Bóveda y corrijan mis números institución por
institución. Los que puse son plausibles pero inventados. Anota siempre quién
te dio cada dato y cuándo: el campo `fuente` de `reglas_vigencia` existe para
eso, porque en seis meses nadie va a recordar si el número sigue siendo cierto.

**Semana 2 · Inventaría el expediente.**
Lista cada documento que ya tienes con su fecha de emisión real, no la fecha
en que lo escanearon. Va a doler ver cuántos están vencidos. Esa lista es la
carga inicial del sistema.

**Semana 3 en adelante · Uso en paralelo.**
Cuando el acceso y la carga funcionen, mete un solo trámite nuevo al sistema
y sigue llevando los demás como siempre. Si a las dos semanas el trámite del
sistema va mejor que los otros, migras el resto. Si no, todavía estás a tiempo
de corregir sin haber roto la operación.

**Qué no hacer:** no migres todo el archivo histórico de golpe, no le des
acceso a un banco antes de haber probado las ligas entre ustedes, y no
vendas el sistema a nadie hasta que lo hayas usado tú mismo un trimestre
completo. El primer cliente que te crea no te va a dar segunda oportunidad.

-- Solo si ya habías ejecutado esquema.sql antes de agregar el correo.
-- Si vas a cargar todo desde cero, ignora este archivo: ya viene incluido.
alter table envios add column if not exists mensaje           text;
alter table envios add column if not exists correo_enviado_en timestamptz;
alter table envios add column if not exists correo_error      text;
-- vuelve a ejecutar vistas.sql para actualizar crear_envio

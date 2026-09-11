# Capturas de ejecución

Capturas tomadas con la aplicación en ejecución (`npm start`) y el backend
funcionando sobre XAMPP con Apache y MySQL activos.

## Vista 1 — Acceso (Login / Registro)

| Captura | Descripción |
|---------|-------------|
| ![Login](01-login.png) | Formulario de inicio de sesión |
| ![Registro](02-registro.png) | Panel de registro tras pulsar "Sign up"; el formulario se desliza |
| ![Login exitoso](03-login-exitoso.png) | Sesión iniciada correctamente: la tarjeta se contrae y muestra la palomita con el saludo al usuario |
| ![Error 401](04-error-401.png) | Contraseña incorrecta. El mensaje proviene del servidor (`401 Unauthorized`) |

## Vista 2 — Galería de fotos

| Captura | Descripción |
|---------|-------------|
| ![Galería](05-galeria.png) | Módulo de cámara con Capacitor |

## Vista 3 — CRUD de usuarios

| Captura | Descripción |
|---------|-------------|
| ![Lista](06-crud-lista.png) | Listado de usuarios obtenido con `GET` |
| ![Crear](07-crud-post.png) | Usuario creado con `POST` (`201 Created`) |
| ![Editar](08-crud-editar.png) | Modo edición: se cargan los datos y aparecen los selectores de estado y método HTTP |
| ![PATCH](09-crud-patch.png) | Actualización parcial con `PATCH`. El mensaje indica qué campos se enviaron |
| ![Error 409](10-crud-error409.png) | Intento de crear un usuario duplicado (`409 Conflict`) |
| ![Eliminar](11-crud-delete.png) | Usuario eliminado con `DELETE` |

## Diseño responsivo

| Captura | Descripción |
|---------|-------------|
| ![CRUD móvil](12-movil-crud.png) | Vista del CRUD en resolución móvil: las columnas se apilan al bajar del breakpoint de 700px |
| ![Login móvil](13-movil-login.png) | Vista de acceso en resolución móvil |

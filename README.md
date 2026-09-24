# SolarApp — Venta e instalación de sistemas solares

Aplicación móvil híbrida construida con **Ionic + Angular + Capacitor**, conectada a una
**API REST en PHP** que corre sobre XAMPP con base de datos **MySQL**.

Proyecto de la materia *Programación para Móviles II*.

---

## Qué hace la aplicación

Permite a un cliente **armar su proyecto solar** (paneles, estructuras, baterías,
inversores e instalación), enviarlo como solicitud y **seguir en qué paso va**.

Del otro lado, un administrador **recibe las solicitudes, las aprueba o rechaza, y fija
las fechas** de visita técnica e instalación.

No es una tienda de compra inmediata: un sistema solar no se compra con un clic. Se
cotiza, se revisa el sitio y se agenda, que es como funciona el negocio real.

### El proceso de un pedido

```
solicitado → en_revision → aprobado → agendado → en_instalacion → completado
                  ↓             ↓          ↓
              rechazado     cancelado   cancelado
```

Las transiciones válidas las decide el servidor: no se puede saltar de *solicitado* a
*completado*, rechazar sin motivo, ni agendar sin fecha de instalación.

---

## Vistas

| # | Vista | Ruta | Descripción |
|---|-------|------|-------------|
| 1 | **Acceso** | `/tabs/tab1` | Inicio de sesión y registro. La sesión sobrevive al cierre de la app. |
| 2 | **Catálogo** | `/tabs/tab2` | Productos con foto, precio y existencias. Filtros por categoría y buscador. Funciona sin conexión. |
| 3 | **Carrito** | `/tabs/tab3` | El proyecto en construcción, guardado en el dispositivo. Desde aquí se envía la solicitud. |
| 4 | **Mis pedidos** | `/tabs/tab4` | Seguimiento: barra de avance, fechas, componentes e historial de cada solicitud. |
| 5 | **Admin** | `/tabs/tab5` | Solo para el rol `admin`. Aprobar, rechazar, agendar y registrar notas técnicas. |

La pestaña de administración **solo existe si el usuario que inició sesión es
administrador**; para un cliente no aparece.

---

## Modelo de datos

```
usuarios ──< pedidos ──< pedido_detalle >── productos
                 └─────< pedido_historial
```

| Tabla | Para qué |
|-------|----------|
| `usuarios` | Clientes y administradores. El campo `rol` los separa. |
| `productos` | Catálogo: paneles, estructuras, baterías, inversores, instalación y accesorios. |
| `pedidos` | La solicitud: estado, domicilio, importes, fechas y notas del administrador. |
| `pedido_detalle` | Partidas del pedido. Copia nombre y precio para que el histórico no cambie si el catálogo cambia. |
| `pedido_historial` | Bitácora de cada cambio de estado. Es lo que alimenta el seguimiento. |

Decisiones de diseño relevantes:

- **El precio nunca viaja desde el cliente.** Al crear el pedido, el servidor vuelve a
  tomarlo del catálogo. Si se confiara en lo que manda la app, cualquiera podría pedir
  paneles a un peso.
- **La creación del pedido es una transacción.** Si una partida falla (sin existencias,
  producto dado de baja), no queda un pedido a medias.
- **El material se aparta al solicitar** y se devuelve al catálogo si se rechaza o
  cancela.
- **Baja lógica en productos**: un producto referenciado por pedidos históricos no se
  borra, se desactiva.

---

## Arquitectura del cliente

```
src/app/
├── models/                       Entidades y tipos derivados
│   ├── usuario.model.ts
│   ├── producto.model.ts
│   ├── pedido.model.ts
│   ├── carrito.model.ts
│   └── respuesta-api.model.ts
├── services/
│   ├── http.service.ts           Transporte HTTP (axios) — no sabe de entidades
│   ├── storage.service.ts        Persistencia local (Capacitor Preferences)
│   ├── sesion.service.ts         Sesión que sobrevive al cierre
│   ├── conexion.service.ts       Detección de red y de servidor
│   ├── pendientes.repository.ts  Cola de solicitudes sin enviar
│   ├── usuario.repository.ts     Entidad Usuario
│   ├── producto.repository.ts    Catálogo + caché offline
│   ├── pedido.repository.ts      Pedidos y cambios de estado
│   └── carrito.repository.ts     Carrito 100% local
├── tab1/ … tab5/                 Las cinco vistas
└── tabs/                         Barra de navegación
```

El patrón es el mismo en toda la capa de datos: **el transporte no sabe de entidades y
las vistas no saben de URLs**. Los repositorios exponen *signals* que las vistas leen
directo, y la app es *zoneless*.

### Qué se guarda en el dispositivo

| Clave en Preferences | Contenido |
|---|---|
| `sesion` | Usuario autenticado (nunca la contraseña) |
| `carrito` | El proyecto en construcción |
| `productos_cache` | Catálogo, para navegarlo sin conexión |
| `pedidos_cache_<id>` | Último estado conocido de los pedidos |
| `pedidos_pendientes` | Solicitudes que no se pudieron enviar por falta de conexión |

---

## Cómo ejecutarlo

### 1. Base de datos

Con **XAMPP** corriendo (Apache y MySQL), importar `api/database.sql` desde phpMyAdmin.
Crea la base `app_usuarios` con las cinco tablas y datos de ejemplo.

### 2. API

Copiar los tres archivos PHP a la carpeta de Apache:

```
api/usuarios.php   →  C:\xampp\htdocs\api\usuarios.php
api/productos.php  →  C:\xampp\htdocs\api\productos.php
api/pedidos.php    →  C:\xampp\htdocs\api\pedidos.php
```

### 3. Aplicación

```bash
cd 9b
npm install
npm start
```

Abre en `http://localhost:4200`.

> Si la API se consume desde el emulador de Android o un teléfono físico, hay que cambiar
> el `HOST` en `src/environments/environment.ts`: `localhost` solo funciona desde el
> navegador de la computadora.

### Cuentas de prueba

La contraseña de las tres es `123456`.

| Usuario | Rol | Para qué sirve |
|---|---|---|
| `admin` | Administrador | Ver el panel de gestión de solicitudes |
| `dmartinez` | Cliente | Tiene pedidos de ejemplo en distintos estados |
| `lgomez` | Cliente | Tiene una solicitud pendiente de revisar |

---

## Endpoints de la API

### `productos.php`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/productos.php` | Catálogo activo |
| GET | `/productos.php?categoria=panel` | Filtra por categoría |
| GET | `/productos.php?buscar=litio` | Busca por nombre, descripción o SKU |
| POST | `/productos.php` | Crea un producto |
| PUT | `/productos.php?id=1` | Reemplaza el registro completo |
| PATCH | `/productos.php?id=1` | Actualiza solo los campos enviados |
| DELETE | `/productos.php?id=1` | Baja lógica |

### `pedidos.php`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/pedidos.php` | Todas las solicitudes (administración) |
| GET | `/pedidos.php?usuario_id=2` | Las de un cliente |
| GET | `/pedidos.php?id=1` | Una, con partidas e historial |
| POST | `/pedidos.php` | Crea la solicitud desde el carrito |
| PATCH | `/pedidos.php?id=1&accion=estado` | Cambia el estado |
| PATCH | `/pedidos.php?id=1` | Edita fechas y notas |
| DELETE | `/pedidos.php?id=1` | Cancela (no borra) |

Todas las respuestas usan la misma envoltura:

```json
{ "ok": true, "mensaje": "...", "datos": { } }
```

---

## Funcionamiento sin conexión

La aplicación detecta si hay red y si el servidor responde, y lo distingue: «sin
internet» y «el servidor está caído» no son el mismo problema ni se resuelven igual.

Sin conexión se puede seguir:

- **Navegando el catálogo**, servido desde la caché del dispositivo.
- **Armando el carrito**, que es 100 % local.
- **Consultando los pedidos**, con el último estado conocido.
- **Enviando una solicitud**: queda guardada y se manda sola al volver la señal.

El detalle está en `docs/RESILIENCIA.md`.

---

## Documentación

| Archivo | Contenido |
|---|---|
| `docs/PERSISTENCIA.md` | Entrega de persistencia local |
| `docs/RESILIENCIA.md` | Manejo de errores y funcionamiento sin conexión |
| `docs/MODELO-DATOS.md` | Modelo de datos y capa de acceso |
| `docs/PROMPTS-IA.md` | Prompts usados durante el desarrollo |
| `docs/capturas/` | Capturas de la aplicación en ejecución |

---

## Tecnologías

- **Ionic 9** + **Angular 22** (standalone, zoneless, signals)
- **Capacitor 8** — Preferences para el almacenamiento local, Network para detectar la conexión
- **axios** para el consumo de la API
- **PHP 8** + **MySQL** (PDO con sentencias preparadas)
- Imágenes de catálogo de [Pexels](https://www.pexels.com) (uso libre)

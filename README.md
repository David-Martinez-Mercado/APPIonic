# APPIonic — Aplicación base del cuatrimestre

Aplicación móvil híbrida construida con **Ionic + Angular + Capacitor**, conectada a una
**API REST en PHP** que corre sobre XAMPP con base de datos **MySQL**.

Este es el proyecto base que se irá ampliando durante el cuatrimestre en la materia
*Programación para Móviles II*.

---

## Objetivo de la aplicación

Gestionar los usuarios de un sistema desde un dispositivo móvil.

La aplicación permite **registrar** una cuenta, **iniciar sesión** validando las
credenciales contra un servidor real, y **administrar** el catálogo completo de
usuarios (consultar, crear, actualizar y eliminar) consumiendo una API REST propia.

Incluye además un módulo de **galería de fotos** que usa la cámara del dispositivo
a través de Capacitor, para demostrar el acceso a las capacidades nativas del teléfono.

El objetivo académico es integrar en un solo proyecto los tres elementos que se verán
durante el curso:

1. Interfaz móvil con Ionic y componentes de Angular.
2. Consumo de servicios web (HTTP con axios) contra un backend propio.
3. Acceso a hardware del dispositivo mediante Capacitor.

---

## Vistas de la aplicación

La aplicación tiene **cuatro vistas** organizadas en pestañas:

| # | Vista | Ruta | Descripción |
|---|-------|------|-------------|
| 1 | **Acceso** | `/tabs/tab1` | Inicio de sesión y registro de usuarios. Panel animado que alterna entre ambos formularios. Valida contra la API y muestra los errores que devuelve el servidor. |
| 2 | **Fotos** | `/tabs/tab2` | Galería que toma fotografías con la cámara del dispositivo y las almacena en el sistema de archivos usando Capacitor. |
| 3 | **Usuarios** | `/tabs/tab3` | CRUD completo: lista todos los usuarios y permite crear (POST), actualizar parcialmente (PATCH), reemplazar (PUT), activar/desactivar y eliminar (DELETE). Guarda una copia local para seguir mostrando datos sin conexión. |
| 4 | **Notas** | `/tabs/tab4` | CRUD de notas guardadas en el propio dispositivo con Capacitor Preferences. No necesita servidor: la información permanece al cerrar y reabrir la aplicación. |

---

## Modelo inicial de datos

### Entidad: `usuarios`

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `INT` | PK, AUTO_INCREMENT | Identificador único |
| `username` | `VARCHAR(50)` | NOT NULL, UNIQUE | Nombre de usuario para iniciar sesión |
| `email` | `VARCHAR(150)` | NOT NULL, UNIQUE | Correo electrónico |
| `full_name` | `VARCHAR(150)` | NOT NULL | Nombre completo de la persona |
| `password` | `VARCHAR(255)` | NOT NULL | Contraseña cifrada con `bcrypt` |
| `activo` | `TINYINT(1)` | NOT NULL, DEFAULT 1 | 1 = cuenta habilitada, 0 = deshabilitada |
| `creado_en` | `TIMESTAMP` | DEFAULT CURRENT_TIMESTAMP | Fecha de alta |
| `actualizado_en` | `TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP | Fecha de última modificación |

**Notas de diseño:**

- La contraseña **nunca** se guarda en texto plano: se cifra con `password_hash()`
  (algoritmo bcrypt) y se valida con `password_verify()`.
- La API **nunca** devuelve el campo `password` en sus respuestas; se elimina del
  objeto antes de enviarlo al cliente.
- `username` y `email` son únicos; intentar duplicarlos devuelve un error `409 Conflict`.
- `activo` permite deshabilitar una cuenta sin borrar el registro (borrado lógico),
  conservando el historial.

### Interfaz en TypeScript

```typescript
export interface Usuario {
  id: number;
  username: string;
  email: string;
  full_name: string;
  activo: number;        // 1 = activo, 0 = inactivo
  creado_en: string;
  actualizado_en: string;
}
```

---

## API REST

Un solo archivo PHP (`api/usuarios.php`) atiende todos los métodos HTTP.

**URL base:** `http://localhost/api/usuarios.php`

| Método | Endpoint | Acción | Éxito |
|--------|----------|--------|-------|
| `GET` | `usuarios.php` | Lista todos los usuarios | `200` |
| `GET` | `usuarios.php?id=1` | Obtiene un usuario | `200` |
| `POST` | `usuarios.php` | Crea un usuario | `201` |
| `POST` | `usuarios.php?accion=login` | Valida credenciales | `200` |
| `PUT` | `usuarios.php?id=1` | Reemplaza **todos** los campos | `200` |
| `PATCH` | `usuarios.php?id=1` | Actualiza **solo** los campos enviados | `200` |
| `DELETE` | `usuarios.php?id=1` | Elimina un usuario | `200` |

### Diferencia entre PUT y PATCH

Es la distinción central del diseño de la API:

- **PUT** reemplaza el recurso completo. Exige que se envíen *todos* los campos,
  incluida la contraseña. Si falta alguno responde `400`.
- **PATCH** aplica una actualización parcial. Construye el `UPDATE` de SQL
  dinámicamente con los campos recibidos y deja el resto intacto. Por ejemplo,
  desactivar una cuenta envía únicamente `{"activo": 0}`.

### Códigos de error implementados

| Código | Significado | Cuándo se devuelve |
|--------|-------------|--------------------|
| `400` | Bad Request | Faltan campos obligatorios o el JSON es inválido |
| `401` | Unauthorized | Usuario o contraseña incorrectos |
| `403` | Forbidden | La cuenta está desactivada (`activo = 0`) |
| `404` | Not Found | No existe un usuario con ese `id` |
| `405` | Method Not Allowed | Método HTTP no soportado |
| `409` | Conflict | El `username` o `email` ya están registrados |
| `422` | Unprocessable Entity | Email con formato inválido o contraseña menor a 6 caracteres |
| `500` | Internal Server Error | Fallo inesperado de la base de datos |
| `503` | Service Unavailable | MySQL no está disponible |

### CORS

La API incluye las cabeceras CORS necesarias y responde al *preflight* `OPTIONS`
con `204`. Sin ese manejo, el navegador bloquea las peticiones `PUT`, `PATCH` y
`DELETE` antes de que lleguen al servidor.

---

## Instalación y ejecución

### Requisitos

- Node.js **v22.22.3+** o **v24.15.0+** (el Angular CLI valida la versión)
- XAMPP con Apache y MySQL
- Ionic CLI

### 1. Backend (XAMPP)

```bash
# Copiar la API al directorio de Apache
cp api/usuarios.php   C:/xampp/htdocs/api/
cp api/database.sql   C:/xampp/htdocs/api/
```

Iniciar **Apache** y **MySQL** desde el panel de XAMPP, y después importar la base
de datos desde phpMyAdmin (`Importar` → seleccionar `database.sql`), o por consola:

```bash
C:/xampp/mysql/bin/mysql.exe -u root < api/database.sql
```

Comprobar que responde: <http://localhost/api/usuarios.php>

### 2. Frontend (Ionic)

```bash
npm install
npm start
```

La aplicación queda disponible en <http://localhost:8100>

### Usuarios de prueba

| Usuario | Contraseña |
|---------|-----------|
| `admin` | `123456` |
| `dmartinez` | `123456` |

### Ejecutar en el dispositivo

`localhost` no funciona desde un teléfono o emulador. Hay que cambiar la constante
`baseUrl` en `src/app/services/api.service.ts`:

| Entorno | URL |
|---------|-----|
| Navegador | `http://localhost/api/usuarios.php` |
| Emulador Android | `http://10.0.2.2/api/usuarios.php` |
| Dispositivo físico | `http://<IP-de-la-PC>/api/usuarios.php` |

```bash
npm run build
npx cap sync
npx cap open android
```

---

## Estructura del proyecto

```
APPIonic/
├── api/
│   ├── usuarios.php          # API REST completa (GET, POST, PUT, PATCH, DELETE)
│   └── database.sql          # Script de la base de datos
├── docs/
│   ├── PROMPTS-IA.md         # Evidencia de prompts usados con IA
│   ├── PERSISTENCIA.md       # Entrega 3: persistencia local
│   ├── PROMPTS-PERSISTENCIA.md # Prompts de la entrega de persistencia
│   └── capturas/             # Capturas de ejecución
├── src/app/
│   ├── services/
│   │   ├── http.service.ts      # Transporte HTTP con axios
│   │   ├── storage.service.ts   # Persistencia local (Capacitor Preferences)
│   │   ├── sesion.service.ts    # Sesión que sobrevive al cierre
│   │   ├── usuario.repository.ts# Entidad Usuario + caché offline
│   │   ├── nota.repository.ts   # Entidad Nota (100% local)
│   │   └── photo.service.ts     # Cámara y almacenamiento (Capacitor)
│   ├── tab1/                 # Vista 1: Login / Registro
│   ├── tab2/                 # Vista 2: Galería de fotos
│   ├── tab3/                 # Vista 3: CRUD de usuarios
│   └── tab4/                 # Vista 4: CRUD de notas locales
└── README.md
```

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Framework | Ionic 8 + Angular 22 (componentes standalone) |
| Runtime nativo | Capacitor 8 |
| Cliente HTTP | axios 1.20 |
| Estado | Angular Signals (aplicación *zoneless*) |
| Backend | PHP 8 con PDO |
| Base de datos | MySQL / MariaDB |
| Pruebas | Karma + Jasmine (35 pruebas) |

---

## Pruebas

```bash
npm test
```

El proyecto incluye **35 pruebas unitarias** que cubren el inicio de sesión, el
registro, las operaciones del CRUD y el manejo de errores de la API. Las pruebas
usan un *mock* del servicio, por lo que no requieren que XAMPP esté encendido.

> **Nota:** no ejecutar `npm test` mientras `npm start` está corriendo; ambos
> procesos compilan al mismo tiempo y provocan un error `EPIPE`.

---

## Documentación adicional

- [`docs/PROMPTS-IA.md`](docs/PROMPTS-IA.md) — Prompts utilizados con IA y análisis
  del código aceptado, modificado y descartado.

---

## Autor

**David Martínez Mercado**
Ingeniería en Software — 9° cuatrimestre
Universidad Politécnica de Durango

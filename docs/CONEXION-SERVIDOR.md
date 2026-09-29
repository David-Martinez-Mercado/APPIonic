# Configuración de la conexión al servidor

**Proyecto:** SolarApp — Venta e instalación de sistemas solares
**Autor:** David Martínez Mercado
**Materia:** Programación para Móviles II

---

## El problema

La aplicación se instala en un teléfono y el servidor (XAMPP con Apache, PHP y MySQL)
vive en otra máquina de la misma red. La dirección de esa máquina **no puede estar fija
en el código**: cambia según la red, y recompilar la app cada vez que cambia la IP no es
viable.

Hasta ahora el host estaba en `environment.ts`, lo que obligaba a editar el archivo y
volver a compilar.

---

## La solución

Un campo en la **pantalla de acceso** donde se escribe la dirección del servidor. Se
guarda en el dispositivo y todas las pestañas consumen las APIs desde ahí.

### Arquitectura de la conexión

```
  Telefono (app Ionic)
        |
        |  HTTP, puerto 80
        v
  Apache + PHP   (192.168.1.195:80)
        |
        |  localhost, puerto 3306
        v
      MySQL
```

**Por qué el teléfono no habla con MySQL directamente.** El puerto 3306 no se configura
ni se usa desde la app: el PHP se conecta a la base de datos en el propio servidor, por
`localhost`. Exponer 3306 a la red abriría la base de datos a cualquiera que la alcance,
sin pasar por la validación del PHP.

Por eso el panel muestra el 3306 como información, pero el único puerto que la aplicación
usa es el **80**.

---

## Qué se agregó

### `ServidorService`

Guarda el host y deriva de él las cuatro URLs:

```typescript
readonly base = computed(() => `http://${this.host()}`);

readonly usuariosUrl  = computed(() => `${this.base()}/api/usuarios.php`);
readonly productosUrl = computed(() => `${this.base()}/api/productos.php`);
readonly pedidosUrl   = computed(() => `${this.base()}/api/pedidos.php`);
readonly pingUrl      = computed(() => `${this.base()}/api/productos.php`);
```

**Normaliza lo que se escribe.** La gente pega la dirección de muchas formas:
`192.168.1.195/`, `http://192.168.1.195`, `192.168.1.195:80`. Las tres deben producir la
misma URL, así que se quita el esquema, las barras finales y el `:80` redundante.

**Valida el formato.** Acepta IPv4 (con octetos de 0 a 255), nombres de equipo y
`localhost`, con puerto opcional. Una IP como `192.168.1.999` se rechaza con un mensaje
claro.

### Prueba de conexión

El botón «Probar conexión» no se limita a comprobar que el equipo conteste: **valida que
sea la API correcta**.

```typescript
const cuerpo = await respuesta.json();

if (!cuerpo || typeof cuerpo.ok !== 'boolean') {
  return {
    ok: false,
    mensaje: 'Hay un servidor en esa direccion, pero no respondio lo que esta ' +
             'aplicacion espera. Revisa que sea el XAMPP correcto.',
  };
}
```

Un servidor puede estar vivo y no tener la carpeta `api` copiada en `htdocs`. Los
mensajes distinguen los tres casos: no responde nadie, responde algo que no es esta API,
o responde correctamente.

### Los repositorios leen la URL en cada llamada

Este es el detalle que hace que el cambio surta efecto sin reiniciar:

```typescript
// Antes: se evaluaba una sola vez al crear el servicio
private readonly url = environment.productosUrl;

// Ahora: se lee en cada peticion
private get url(): string {
  return this.servidor.productosUrl();
}
```

Con una propiedad calculada al construir el servicio, cambiar la IP no habría tenido
efecto hasta reiniciar la aplicación.

---

## Un problema encontrado al probarlo

**Síntoma.** La IP se guardaba correctamente en el dispositivo, el panel la mostraba,
pero el catálogo seguía pidiendo los datos a `localhost`.

**Cómo se detectó.** Capturando las peticiones reales con el protocolo de depuración de
Chrome:

```
peticiones a la API: http://localhost/api/productos.php
FALLA  las peticiones van a la IP configurada
```

**Causa.** El mismo patrón que ya había aparecido dos veces en este proyecto: las vistas
ejecutan su `ngOnInit` **en paralelo** con la barra de pestañas, que es quien restaura el
host desde el dispositivo. Cuando `tab2` pedía el catálogo, `ServidorService` todavía
tenía el valor de compilación.

**Solución.** Cada vista espera a que la dirección esté leída antes de pedir nada:

```typescript
async ngOnInit() {
  await this.servidor.listo();   // primero la direccion
  await this.repo.cargarCache();
  await this.cargar();
}
```

**Aprendizaje.** Es la tercera vez que aparece este mismo fallo, siempre con la misma
forma: un dato que se lee del dispositivo de forma asíncrona y un componente que lo
consulta antes de tiempo. En una app *zoneless* con carga en paralelo, cualquier estado
que venga del almacenamiento necesita una promesa que las vistas puedan esperar.

---

## Prueba realizada

**Resultado: 8 de 8 comprobaciones correctas.**

| # | Comprobación | Resultado |
|---|---|---|
| 1 | El panel aparece en la vista de acceso | visible |
| 2 | Al desplegarlo muestra el campo de IP | presente |
| 3 | Muestra el puerto 80 como sufijo fijo | `:80` |
| 4 | Probar conexión contra la IP real | «Conectado. 10 producto(s)» |
| 5 | La IP queda guardada en el dispositivo | `192.168.1.195` |
| 6 | El catálogo carga tras configurarla | 10 productos |
| 7 | **Las peticiones van a la IP configurada** | `http://192.168.1.195/api/productos.php` |
| 8 | La dirección sobrevive al reinicio | correcta |

---

## Cómo usarlo desde un teléfono

1. **Averiguar la IP del equipo** donde corre XAMPP:

   ```
   ipconfig        (Windows, buscar "Direccion IPv4")
   ```

2. **Permitir el puerto 80 en el firewall** de esa máquina, si Windows lo bloquea.

3. **Comprobar desde el teléfono** que la API responde, abriendo en el navegador:

   ```
   http://192.168.1.195/api/productos.php
   ```

   Debe verse el JSON del catálogo.

4. **En la app**, pestaña *Acceso* → desplegar el panel del servidor → escribir la IP →
   «Probar conexión» → «Guardar».

5. Las cinco pestañas pasan a consumir las APIs desde esa dirección.

### Si no conecta

| Mensaje | Qué revisar |
|---|---|
| «No se pudo conectar» | Apache iniciado, firewall, misma red |
| «El servidor no respondió a tiempo» | La IP es correcta pero el equipo no responde |
| «Respondió 404» | Falta copiar la carpeta `api` en `htdocs` |
| «No respondió lo que esta aplicación espera» | Hay otro servidor en esa dirección |

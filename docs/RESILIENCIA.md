# Manejo de errores y funcionamiento sin conexión

**Proyecto:** SolarApp — Venta e instalación de sistemas solares
**Autor:** David Martínez Mercado
**Materia:** Programación para Móviles II
**Herramienta de IA utilizada:** Claude (Anthropic) mediante Claude Code en VS Code

---

## 1. Objetivo de la entrega

Implementar una estrategia para que la aplicación **reaccione ante problemas de conexión
o fallos en el acceso a los datos** en lugar de quedarse en blanco o mostrar un error
técnico que el usuario no puede interpretar.

El punto de partida ya tenía parte del camino andado: la entrega de persistencia dejó una
caché local en el dispositivo y un `ApiError` que traducía los fallos de axios. Lo que
faltaba era lo más visible para el usuario:

| Qué faltaba | Consecuencia |
|---|---|
| Nada sabía si había red | La app intentaba pedir datos y fallaba sin explicar por qué |
| Todos los fallos se veían igual | «Sin internet» y «el servidor está caído» daban el mismo mensaje |
| No había forma de reintentar | Había que cerrar y reabrir la aplicación |
| Un envío fallido se perdía | El cliente armaba su proyecto, pulsaba enviar, y lo perdía todo |

---

## 2. Detección de estado de conexión

Se instaló **`@capacitor/network`**, que reporta el estado de red del sistema operativo
y avisa mediante un *listener* en cuanto cambia, sin tener que preguntar cada pocos
segundos.

### La distinción central

`ConexionService` separa dos cosas que suelen confundirse:

| Concepto | Qué significa | Cómo se sabe |
|---|---|---|
| **Red** | El dispositivo tiene wifi o datos | Capacitor Network |
| **Servidor** | La API responde | Cada petición de `HttpService` |

**Por qué importa:** no son el mismo problema y el usuario no puede resolverlos igual.
Si no hay red, lo útil es «revisa tu wifi»; si hay red pero el servidor no contesta, lo
útil es «no es tu teléfono, el servicio está caído».

```typescript
readonly enLinea = computed(() => this.hayRed() && this.servidorResponde());

readonly motivo = computed<MotivoDesconexion>(() => {
  if (!this.hayRed()) {
    return 'sin_red';
  }
  if (!this.servidorResponde()) {
    return 'servidor_caido';
  }
  return 'ninguno';
});
```

### Una limitación conocida

En el navegador, Capacitor Network se apoya en `navigator.onLine`, que solo sabe si hay
una interfaz de red levantada: estar conectado a un wifi **sin salida a internet** se
reporta como «en línea». Por eso la comprobación contra el servidor no sobra — es la que
detecta ese caso.

---

## 3. Manejo de errores

Todo el manejo vive en `HttpService`, que es el único punto por el que pasan las
peticiones. Las vistas no revisan `error.response`: reciben un `ApiError` ya traducido.

### El código 0 como marca de fallo de transporte

```typescript
if (err.response) {
  // El servidor respondio con 4xx o 5xx: esta vivo, contesto.
  this.conexion.registrarExito();
  throw new ApiError(cuerpo?.error ?? `Error ${err.response.status}`, ...);
}

// Sin respuesta: el problema es de conexion, no de la peticion.
this.conexion.registrarFalloDeRed();
throw new ApiError(this.conexion.mensaje(), 0);
```

Un **404 o un 422 significan que el servidor está perfectamente vivo**: contestó. Lo que
falló fue la petición. Solo los fallos sin respuesta marcan la conexión como caída, y se
distinguen por el código `0`.

Esa distinción es la que permite, más adelante, decidir si una solicitud se encola para
reintentar o si hay que corregirla.

### Reintentos automáticos

Un fallo de red suele ser momentáneo: el wifi que parpadea, el servidor que tarda en
arrancar. `HttpService` reintenta hasta dos veces con espera creciente (400 ms, 800 ms).

**Solo las lecturas se reintentan.** Reintentar una escritura es peligroso: si el `POST`
llegó al servidor y lo que se perdió fue la respuesta de vuelta, un reintento crearía un
segundo pedido sin que el usuario lo sepa.

```typescript
async get<T>(url: string): Promise<T> {
  return this.conReintentos(async () => { ... });   // reintenta
}

async post<T>(url: string, cuerpo: unknown): Promise<T> {
  return this.unaVez(async () => { ... });          // NO reintenta
}
```

Tampoco se reintenta cuando el servidor respondió: si contestó 422, volver a preguntar
dará exactamente lo mismo y solo retrasa el aviso.

---

## 4. Mensajes adecuados al usuario

Cada mensaje dice **qué pasó y qué puede hacer** el usuario. Un «Error de conexión» a
secas no le sirve a nadie.

| Situación | Mensaje |
|---|---|
| Sin red | «Sin conexión a internet. Revisa tu wifi o tus datos móviles. Puedes seguir navegando el catálogo guardado.» |
| Servidor caído | «No se pudo contactar al servidor. Tu conexión funciona, pero el servicio no responde. Verifica que Apache esté iniciado en XAMPP.» |
| Timeout | «La petición tardó demasiado y se canceló. Revisa tu conexión e intenta de nuevo.» |
| Datos de caché | «Sin conexión con el servidor. Mostrando el catálogo guardado en el dispositivo (última sincronización: …).» |

El aviso es un componente reutilizable, `EstadoConexionComponent`, que se coloca una vez
en cada pantalla. **Aparece solo cuando hay un problema**: si todo funciona, no ocupa
espacio ni distrae.

Que sea un componente y no un bloque repetido en cada plantilla tiene dos razones: las
cinco pantallas dicen exactamente lo mismo ante el mismo fallo, y cambiar un texto es un
solo cambio.

Además:

- **Los colores distinguen el tipo de problema.** Ámbar para «sin red» (el usuario puede
  hacer algo), rojo para «servidor caído» (no depende de él).
- **Muestra la hora del último contacto** correcto con el servidor, para que se note si
  los datos llevan mucho sin refrescarse.
- **Ofrece un botón «Reintentar»** que vuelve a preguntar al servidor de verdad, en lugar
  de fiarse del estado guardado: el usuario pulsa ese botón justo porque cree que ya se
  arregló.
- **Avisa cuando la conexión vuelve**, con un mensaje verde que desaparece a los pocos
  segundos.

---

## 5. Estrategia de caché y almacenamiento temporal

Todo se guarda con **Capacitor Preferences**, la misma tecnología de la entrega anterior.

| Clave | Contenido | Para qué sirve sin conexión |
|---|---|---|
| `productos_cache` | Catálogo completo | Se puede seguir navegando y armando el proyecto |
| `productos_sincronizado` | Fecha de la última sincronización | Advierte si los datos son viejos |
| `pedidos_cache_<id>` | Último estado conocido de los pedidos | El cliente consulta en qué va su proyecto |
| `carrito` | El proyecto en construcción | Se arma sin conexión y sobrevive al cierre |
| `sesion` | Usuario autenticado | No hay que volver a iniciar sesión |
| `pedidos_pendientes` | Solicitudes que no se pudieron enviar | **Nuevo en esta entrega** |

### La caché no oculta el error

Cuando falla la petición, el repositorio carga la copia local **pero vuelve a lanzar la
excepción**:

```typescript
async listar(): Promise<Producto[]> {
  try {
    const productos = await this.http.get<Producto[]>(url);
    ...
  } catch (e) {
    await this.cargarCache();   // deja los ultimos datos conocidos
    throw e;                    // pero el error sigue propagandose
  }
}
```

Tragarse el error habría hecho que el usuario confundiera datos viejos con actuales.

### Cola de solicitudes pendientes

Es lo más importante que se agregó en esta entrega. Sin ella, un cliente que arma su
proyecto en una azotea sin señal pierde el trabajo: pulsa «Enviar», falla, y se queda sin
nada.

Con la cola, la solicitud se guarda en el dispositivo y se manda sola cuando vuelve la
conexión:

```typescript
} catch (e) {
  // Un fallo de red (codigo 0) no es culpa de la solicitud: se guarda
  // para mandarla en cuanto vuelva la conexion.
  if (e instanceof ApiError && e.codigo === 0) {
    await this.cola.encolar(solicitud);
    await this.carrito.vaciar();
    this.mensajeOk.set('Sin conexion: tu solicitud quedo guardada...');
  } else {
    this.mostrarError(e);
  }
}
```

**Solo se encolan los fallos de red.** Si el servidor respondió 422 porque falta stock,
reintentarlo después dará el mismo error: eso hay que corregirlo, no reintentarlo.

La vista del carrito muestra las solicitudes en espera con su fecha, el número de
intentos y el último error, y permite reenviarlas o descartarlas.

---

## 6. Prueba de funcionamiento sin conexión

La prueba se automatizó con el protocolo de depuración de Chrome
(`Network.emulateNetworkConditions`), que es lo mismo que hace la pestaña **Offline** de
las herramientas de desarrollo.

**Resultado: 11 de 11 comprobaciones correctas.**

| # | Comprobación | Resultado |
|---|---|---|
| 1 | El catálogo carga del servidor | 10 productos |
| 2 | La caché queda guardada en el dispositivo | 10 en caché |
| 3 | Sin problemas, el aviso no estorba | oculto |
| 4 | Al cortar la red aparece el aviso | visible |
| 5 | El aviso distingue «sin red» de «servidor caído» | correcto |
| 6 | Ofrece un botón de reintentar | presente |
| 7 | El catálogo sigue navegable desde la caché | 10 productos |
| 8 | Se puede agregar al carrito sin conexión | 1 línea guardada |
| 9 | La vista de pedidos también avisa | visible |
| 10 | Al volver la red el aviso desaparece | correcto |
| 11 | El catálogo vuelve a cargar del servidor | 10 productos |

### Cómo reproducirla a mano

**Prueba A — sin red (no necesita XAMPP):**

1. Abrir la aplicación con conexión y entrar al catálogo, para que se llene la caché.
2. Abrir las herramientas de desarrollo → pestaña **Network** → marcar **Offline**.
3. Cambiar de pestaña dentro de la app: aparece el aviso ámbar y el catálogo **sigue
   viéndose**.
4. Agregar productos al carrito: funciona, porque el carrito es local.
5. Desmarcar **Offline** y pulsar «Reintentar»: el aviso desaparece.

**Prueba B — servidor caído (con red):**

1. Con la aplicación abierta, **detener Apache** desde el panel de XAMPP.
2. Entrar a Usuarios o Mis pedidos: aparece el aviso **rojo**, distinto del ámbar, con el
   mensaje de que el servicio no responde.
3. Volver a iniciar Apache y pulsar «Reintentar».

**Prueba C — solicitud pendiente:**

1. Armar un carrito e iniciar sesión.
2. Poner el navegador en **Offline**.
3. Pulsar enviar: el botón dice «Guardar solicitud (sin conexión)» y la solicitud queda
   en la lista de pendientes.
4. Restablecer la conexión y pulsar «Intentar enviar ahora»: se envía y aparece el folio.

---

## 7. Bitácora de problemas encontrados

### Problema 1 — El panel de administración salía vacío para un administrador

**Síntoma.** Al entrar como `admin`, la pestaña de administración mostraba «No hay
solicitudes» aunque la base tenía tres pedidos.

**Qué se descartó primero.** Se probó la API directamente con `curl`:

```
GET /api/pedidos.php  →  ok: true, 3 pedido(s) encontrado(s)
```

El servidor respondía correctamente, así que el fallo estaba en el cliente. También se
revisó la consola del navegador: no había ningún error.

**Causa.** Las vistas montan su `ngOnInit` **en paralelo** con la barra de pestañas, que
es quien restaura la sesión desde el dispositivo. Cuando `tab5` preguntaba por el rol, la
sesión todavía era `null`, así que `esAdmin()` devolvía `false` y `cargar()` salía sin
pedir nada.

**Solución.** `SesionService` expone ahora una promesa de restauración que las vistas
pueden esperar:

```typescript
restaurar(): Promise<Usuario | null> {
  if (this.restauracion) {
    return this.restauracion;   // si ya hay una lectura en curso, la misma
  }
  this.restauracion = this.storage.obtener<Usuario>(...).then(...);
  return this.restauracion;
}

async listo(): Promise<void> {
  await this.restaurar();
}
```

Y cada vista la espera antes de decidir:

```typescript
async ngOnInit() {
  await this.sesion.listo();
  await this.cargar();
}
```

**Papel de la IA.** La IA encontró la causa después de descartar la API con `curl` y
revisar la consola. Lo relevante del caso es que **el error no se veía en ningún log**:
no había excepción, la petición simplemente nunca se hacía.

**Aprendizaje.** En una aplicación *zoneless* con carga asíncrona, «el dato llegó» y «el
componente ya lo puede leer» son dos momentos distintos.

---

### Problema 2 — La sesión se guardaba pero al reabrir pedía login otra vez

**Síntoma.** Tras iniciar sesión y recargar la aplicación, volvía a aparecer el
formulario de acceso. En `localStorage` la clave `CapacitorStorage.sesion` **sí tenía**
el usuario guardado.

**Cómo se detectó.** Apareció al automatizar las capturas de pantalla para la entrega
anterior: el script hacía login, recargaba y esperaba ver la palomita, pero encontraba el
formulario.

**Causa.** `Tab1Page` mantenía `isActive` como una propiedad normal:

```typescript
isActive = false;            // antes
...
this.isActive = true;        // se asigna DESPUES de un await
```

La aplicación es **zoneless**: Angular no vigila propiedades normales. `restaurar()`
resuelve de forma asíncrona, y para cuando el valor cambiaba Angular ya no estaba
observando. El estado era correcto en memoria, pero la vista nunca se repintaba.

**Solución.** Convertirlo en signal, que es lo que ya usaba el resto del componente:

```typescript
isActive = signal(false);    // despues
...
this.isActive.set(true);
```

**Papel de la IA.** La IA localizó la causa, pero lo que destapó el fallo fue **ejecutar
la aplicación de verdad**: ni la compilación ni las pruebas unitarias del repositorio lo
detectaban, porque la lógica de persistencia era correcta.

**Aprendizaje.** El propio comentario del código ya advertía *«se usan signals porque la
app es zoneless»*, y aun así la regla se rompía en dos propiedades heredadas de la
plantilla original. Una convención escrita en un comentario no se aplica sola.

---

### Problema 3 — La prueba sin conexión daba un falso fallo

**Síntoma.** Al automatizar la prueba offline, la comprobación «la vista de pedidos
también avisa» fallaba. El texto que devolvía la página era:

> «Pulsa la barra espaciadora para jugar. Prueba a: comprobar los cables de red, el módem
> y el router…»

**Causa.** Ese texto es la **página de error del propio Chrome** (el juego del
dinosaurio). El script cortaba la red y *después* navegaba a la ruta: como la aplicación
no estaba cargada, el navegador nunca llegó a servirla.

Era un fallo del **método de prueba**, no de la aplicación.

**Solución.** Invertir el orden, que además es el caso real: el usuario ya tiene la
aplicación abierta y se queda sin señal.

```javascript
await red(true);
await ir('/tabs/tab4', 4500);        // se carga CON conexion
await red(false);                    // y se corta despues
await ev(`window.dispatchEvent(new Event('offline'))`);
```

Con el orden corregido, la comprobación pasó y el resultado fue 11 de 11.

**Papel de la IA.** La IA escribió la prueba y también diagnosticó su propio fallo al
leer el texto devuelto. Lo importante fue **no dar por bueno el resultado negativo**: la
primera lectura habría sido «la vista de pedidos no avisa», que era falso.

**Aprendizaje.** Una prueba que falla puede estar mal escrita. Antes de tocar el código
hay que confirmar que la prueba mide lo que dice medir — aquí, el texto del error lo
delataba.

---

## 8. Archivos entregados

### Nuevos

```
src/app/services/conexion.service.ts            Deteccion de red y de servidor
src/app/services/pendientes.repository.ts       Cola de solicitudes sin enviar
src/app/components/estado-conexion.component.ts Aviso reutilizable
```

### Modificados

```
src/app/services/http.service.ts   Reintentos, y avisa a ConexionService
src/app/services/sesion.service.ts Promesa de restauracion (problema 1)
src/app/tab1/tab1.page.ts          isActive e isLogIn como signals (problema 2)
src/app/tab2/tab2.page.ts / .html  Aviso de conexion
src/app/tab3/tab3.page.ts / .html  Aviso, cola de pendientes y su estilo
src/app/tab4/tab4.page.ts / .html  Aviso de conexion
src/app/tab5/tab5.page.ts / .html  Aviso de conexion
src/app/tabs/tabs.page.ts          Inicia la deteccion al arrancar
src/environments/environment.ts    pingUrl para comprobar el servidor
package.json                       @capacitor/network
```

### Cómo ejecutar

Desde la carpeta `9b/`:

```bash
npm install
npm start
```

La prueba sin conexión se reproduce a mano con las herramientas de desarrollo del
navegador, siguiendo los pasos de la sección 6.

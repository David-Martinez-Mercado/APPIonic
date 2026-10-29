# Evidencia de uso de Inteligencia Artificial

**Proyecto:** APPIonic — Aplicación base del cuatrimestre
**Autor:** David Martínez Mercado
**Herramienta utilizada:** Claude (Anthropic) mediante Claude Code en VS Code

---

## Contexto

El proyecto partió de la plantilla oficial de Ionic (`photo-gallery-capacitor-ng`),
que ya traía la estructura de tres pestañas y el módulo de cámara funcionando.
Sobre esa base se usó IA para transformar diseños en HTML/CSS plano al lenguaje de
Ionic + Angular, y para construir el backend en PHP.

El flujo de trabajo fue: instalar las dependencias necesarias, dar un prompt con el
código fuente original (HTML/Pug, CSS/Sass, JS), revisar lo que generaba la IA,
detectar los fallos y corregirlos.

---

## Prompt 1 — Conversión de una plantilla HTML/Sass/jQuery a Ionic + Angular

### Prompt utilizado

> "modifica tab 1 con base a este html `[código Pug del formulario Log in / Sign up]`,
> este CSS `[código Sass con mixins de Compass]` y este JS
> `[código jQuery con toggleClass y addClass]`. Asegúrate que funcione antes de terminar."

### Qué se pidió

Convertir una plantilla de CodePen — escrita en **Pug**, **Sass con sintaxis
indentada** y **jQuery** — a los lenguajes que usa el proyecto: HTML de Angular,
SCSS y TypeScript.

### Resultado y correcciones aplicadas

La conversión estructural fue correcta, pero hubo varios puntos que corregir:

**1. Se descartó por completo el uso de jQuery.**

El JavaScript original manipulaba el DOM directamente:

```javascript
$(".info-item .btn").click(function(){
  $(".container").toggleClass("log-in");
});
```

Este enfoque **se rechazó**. jQuery no está instalado en el proyecto y, más
importante, contradice el modelo de Angular: en lugar de modificar clases del DOM a
mano, el estado debe vivir en el componente y la plantilla reaccionar a él. Se
reemplazó por *binding* de clases:

```html
<div class="container" [class.log-in]="isLogIn" [class.active]="isActive">
```

```typescript
toggleForm() {
  this.isLogIn = !this.isLogIn;
}
```

**2. Se modificaron los mixins de Compass.**

El Sass original usaba `@include transition(all 0.5s)`, que depende de la librería
Compass (ya obsoleta). Se sustituyó por la propiedad CSS estándar `transition`, que
hoy no necesita prefijos de navegador.

**3. Se corrigió la división en Sass.**

El código traía `$width/2-80px`. La división con `/` fue eliminada en las versiones
modernas de Sass y genera error de compilación. Se cambió a `math.div($width, 2) - 80px`
importando `sass:math`.

**4. Error detectado al revisar la ejecución: los botones cortaban el texto.**

Al abrir la aplicación, el botón "Sign up" se mostraba partido en tres líneas
("Sig / n / up"). La causa era la regla `width: 60px` heredada del CSS original, que
no alcanzaba para el texto. Se corrigió con:

```scss
width: max-content;
min-width: 60px;
white-space: nowrap;
```

**5. Error detectado al revisar la ejecución: los campos de texto salían oscuros.**

Los `input` se veían con fondo oscuro y texto casi invisible. El motivo es que Ionic
aplica su propio tema (modo oscuro) a los elementos de formulario. Se forzó el color
explícitamente:

```scss
background-color: #fff;
color: #333;
```

### Conclusión del prompt 1

- **Aceptado:** la estructura HTML convertida desde Pug y la conversión general del Sass.
- **Modificado:** los mixins de Compass, la división de Sass, el ancho de los botones
  y el color de los campos de texto.
- **Descartado:** todo el código jQuery, reemplazado por *binding* de Angular.

---

## Prompt 2 — Generación de la API REST en PHP

### Prompt utilizado

> "crear en xampp una api mediante php, conectar el login con axios a la api de xampp.
> Crea en php un api crud de usuarios con las tablas del cors, solo genera un archivo
> con los diferentes métodos (no olvides el patch), agrega códigos de error."

### Qué se pidió

Un backend REST completo en **un solo archivo PHP**, con manejo de CORS, todos los
métodos HTTP (incluido `PATCH`) y códigos de error HTTP apropiados.

### Resultado y correcciones aplicadas

**1. Error grave detectado: las contraseñas de prueba no servían.**

El script SQL generado incluía usuarios de ejemplo con un hash inventado:

```sql
INSERT INTO usuarios (...) VALUES
  ('admin', 'admin@demo.com', 'Administrador', '$2y$10$e0NRzWyH1tGJ7VJqU8Xn7uKQF1Zq...');
```

Ese hash **no correspondía a ninguna contraseña real**, por lo que
`password_verify()` siempre devolvía `false` y era imposible iniciar sesión con los
usuarios de prueba. Se corrigió generando el hash real con PHP:

```bash
php -r 'echo password_hash("123456", PASSWORD_DEFAULT);'
```

Y verificando que efectivamente validara antes de insertarlo en el script.

**2. Se aceptó el manejo del preflight CORS.**

Este bloque resultó indispensable y se conservó tal cual:

```php
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
```

Sin él, el navegador bloquea las peticiones `PUT`, `PATCH` y `DELETE` antes de
enviarlas, porque primero manda una petición `OPTIONS` de comprobación.

**3. Se aceptó la construcción dinámica del `UPDATE` para PATCH.**

Es la parte que diferencia realmente a `PATCH` de `PUT`: solo se arma la consulta
con los campos que llegaron en la petición.

```php
foreach ($permitidos as $campo) {
    if (!array_key_exists($campo, $datos)) {
        continue;   // no se envió, no se toca
    }
    $sets[]    = "$campo = ?";
    $valores[] = $valor;
}
```

**4. Se modificó el mensaje de error del login.**

La versión inicial distinguía entre "el usuario no existe" y "la contraseña es
incorrecta". Se unificó en un solo mensaje (`"Usuario o contrasena incorrectos"`)
porque devolver mensajes distintos permite averiguar qué usuarios existen en el
sistema.

### Pruebas realizadas

Se verificó cada método con `curl` contra Apache y MySQL en ejecución, comprobando
que devolviera el código HTTP correcto:

| Prueba | Esperado | Resultado |
|--------|----------|-----------|
| `GET` lista completa | `200` | Correcto |
| `GET` con id inexistente | `404` | Correcto |
| `POST` login correcto | `200` | Correcto |
| `POST` login con contraseña errónea | `401` | Correcto |
| `POST` cuenta desactivada | `403` | Correcto |
| `POST` crear usuario | `201` | Correcto |
| `POST` username duplicado | `409` | Correcto |
| `POST` email con formato inválido | `422` | Correcto |
| `PUT` sin todos los campos | `400` | Correcto |
| `PATCH` solo un campo | `200` | Correcto |
| `DELETE` id inexistente | `404` | Correcto |
| `OPTIONS` (preflight) | `204` | Correcto |

### Conclusión del prompt 2

- **Aceptado:** la estructura general del archivo, el manejo de CORS con preflight,
  el `UPDATE` dinámico de PATCH y el uso de consultas preparadas con PDO (que
  previene inyección SQL).
- **Modificado:** los hashes de las contraseñas de prueba (estaban inventados) y el
  mensaje de error del login.
- **Descartado:** nada relevante en este prompt.

---

## Prompt 3 — Vista CRUD con una plantilla de formulario

### Prompt utilizado

> "quiero que crees el CRUD con todo y patch, básate en el siguiente formato pero
> adáptalo `[HTML de una plantilla de formulario de contacto]`,
> `[Sass con variables, lighten(), darken() y media queries]`."

### Qué se pidió

Construir la vista del CRUD reutilizando el diseño de un formulario de contacto
(estructura de dos columnas: información a la izquierda, formulario a la derecha).

### Resultado y correcciones aplicadas

**1. Se modificaron las funciones de color obsoletas.**

La plantilla original usaba `lighten($color-principal, 50%)` y
`darken($color-principal, 15%)`. Ambas funciones están **deprecadas** en las
versiones actuales de Sass y llenan la consola de advertencias en cada compilación.
Se sustituyeron por la API moderna:

```scss
@use "sass:color";
$claro-50: color.adjust($color-principal, $lightness: 50%);
```

**2. Error detectado al revisar la ejecución: el texto era ilegible.**

Al tomar la primera captura de la vista terminada, se observó que los títulos, las
etiquetas y los nombres de los usuarios aparecían en un gris casi blanco sobre un
fondo claro, resultando prácticamente ilegibles.

La causa es que Ionic define el color del texto mediante la variable CSS
`--ion-text-color`, que tiene prioridad sobre la propiedad `color` del SCSS del
componente. Se corrigió fijando la variable y forzando el color en los elementos:

```scss
ion-content {
  --color: #{$color-principal};
}

.contenedor,
.contenedor h1,
.contenedor h3,
.contenedor label { 
  color: $color-principal; 
}
```

**3. Se acotó la corrección anterior.**

La primera versión del arreglo aplicaba el color a **todos** los elementos, lo que
pisaba los colores verde y rojo de las etiquetas de estado ("Activo"/"Inactivo") y
de los mensajes de error. Se ajustó el selector para excluirlos:

```scss
.contenedor span:not(.estado):not(.nombre-empresa),
.contenedor p:not(.aviso) {
  color: $color-principal;
}
```

**4. Se añadió la comparación contra el estado original para el PATCH.**

Para que `PATCH` tuviera sentido real y no enviara el registro completo, se
implementó una comparación entre el formulario y los datos originales del usuario,
de forma que solo viajen los campos modificados:

```typescript
private calcularCambios(): Partial<Usuario & { password: string }> {
  const cambios = {};
  if (this.form.username.trim() !== o.username) cambios.username = ...;
  // La contraseña solo viaja si el usuario escribió una nueva
  if (this.form.password.trim()) cambios.password = this.form.password;
  return cambios;
}
```

Se comprobó en ejecución: al cambiar únicamente el nombre, la petición enviada
contenía solo `{"full_name": "..."}`.

### Conclusión del prompt 3

- **Aceptado:** la estructura de dos columnas con CSS Grid, el breakpoint de 700px
  y el diseño general de la plantilla.
- **Modificado:** las funciones `lighten()`/`darken()`, el color del texto
  sobrescrito por Ionic, y el alcance del selector que lo corregía.
- **Descartado:** nada sustancial; la plantilla se adaptó completa.

---

## Prompt 4 — Diagnóstico de un error de ejecución

### Prompt utilizado

> "npm run build → npm error Missing script: 'build'"

### Qué ocurrió

Al intentar compilar, npm respondía que no existía el script `build`.

El diagnóstico mostró que el comando se estaba ejecutando desde la carpeta `APP`,
mientras que el proyecto Ionic vive en `APP/9b`. Además, una instalación previa de
`axios` se había ejecutado en la carpeta equivocada, creando un `package.json`
suelto que solo contenía esa dependencia y ningún script.

### Solución

```powershell
cd 9b
npm run build
```

Y eliminar los archivos generados por error en la carpeta superior
(`package.json`, `package-lock.json`, `node_modules`).

### Aprendizaje

Este caso dejó claro que conviene verificar siempre el directorio de trabajo antes
de ejecutar comandos de npm, porque npm no avisa cuando se instala una dependencia
en una carpeta que no es un proyecto.

---

## Prompt 5 — Persistencia local con Capacitor Preferences

### Prompt utilizado

> "Analiza el código e implementa persistencia local: guardar datos en el
> dispositivo, que sobrevivan al cierre de la aplicación, con operaciones CRUD
> completas."

### Qué se aceptó

El envoltorio sobre `@capacitor/preferences` (`StorageService`) y el patrón de
repositorio con *signals*: la vista lee el signal y el repositorio escribe en
disco antes de terminar cada operación.

### Qué hubo que corregir

La primera versión perdía datos cuando el JSON guardado estaba corrupto: un
`JSON.parse` sin protección tumbaba toda la carga. Se agregó recuperación, de
modo que una clave dañada se descarta sin arrastrar al resto.

### Aprendizaje

Que un dato esté en disco no significa que se pueda leer. Toda lectura de
almacenamiento necesita decidir qué hacer cuando lo guardado no sirve.

---

## Prompt 6 — Resiliencia y manejo de errores de red

### Prompt utilizado

> "Implementa detección de conexión, manejo de errores, caché, prueba sin
> conexión y una bitácora de tres problemas."

### Qué se aceptó

La separación entre **hay red** (lo que reporta el sistema operativo) y
**responde el servidor**. Son dos fallos distintos y se resuelven distinto:
«sin internet» y «Apache está apagado» no se arreglan igual.

También el criterio de reintentos: **solo en lecturas (GET), nunca en
escrituras**. Reintentar un POST de pedido crearía pedidos duplicados.

### Qué hubo que corregir

El indicador de carga nunca llegaba a verse. La IA había puesto
`cargando.set(true)` dentro de `cargar()`, después de dos `await`, así que la
pantalla ya estaba pintada cuando el indicador se activaba. Se movió al inicio
del `ngOnInit`.

### Aprendizaje

En una aplicación *zoneless*, el orden de los `await` decide lo que el usuario
alcanza a ver. No basta con que el código sea correcto: tiene que ejecutarse en
el momento correcto.

---

## Prompt 7 — Configuración de la IP del servidor desde la aplicación

### Prompt utilizado

> "Agrega un input en el login para definir la IP del servidor; que se guarde en
> JSON y que todas las pestañas tomen esa IP; agrega una pantalla de orígenes de
> datos y un mensaje dinámico bajo el password."

### Qué hubo que corregir

Las vistas seguían pidiendo a `localhost` aunque la IP estuviera guardada. La
causa era que los repositorios cacheaban la URL en una propiedad
(`private readonly url`), fijada al construirse el servicio, antes de que se
leyera la configuración del disco.

Se cambió por un *getter*, de modo que la URL se resuelve en cada petición.

### Aprendizaje

Un valor que depende de una lectura asíncrona no puede calcularse en el
constructor. Este mismo error apareció cuatro veces en el proyecto, con
distintas caras: la sesión, el panel de administración, la IP del servidor y la
cola de pendientes.

---

## Prompt 8 — Consumo de API REST y sincronización

### Prompt utilizado

> "Documenta el consumo de API REST (GET/POST/PUT/PATCH/DELETE), los servicios
> de Angular, el manejo de errores y la carga. Después, implementa la
> sincronización entre lo local y lo remoto."

### Qué se aceptó

La cola de solicitudes pendientes: si no hay conexión al enviar un pedido, se
guarda en el dispositivo y se manda sola cuando vuelve la señal. Y el criterio
de qué se encola: **solo los fallos de red (código 0)**. Si el servidor
respondió 422 por falta de existencias, reintentarlo dará el mismo error.

### Qué hubo que corregir

Un error introducido por la propia IA: el suscriptor comprobaba
`if (!this.hayPendientes()) return;` **antes** de leer el disco. Si el usuario
estaba en otra vista, la memoria estaba vacía aunque el dispositivo tuviera
solicitudes guardadas, y la sincronización salía sin hacer nada.

Dos líneas en orden inverso. Se detectó porque la prueba automatizada mostró que
la cola no se vaciaba.

### Aprendizaje

El error más caro del proyecto fue de orden, no de lógica: cada línea era
correcta por separado.

---

## Prompt 9 — Elemento multimedia: simulador con gráfica SVG

### Prompt utilizado

> "Agrega a la aplicación un elemento multimedia o una interacción gráfica
> relacionada con su proyecto."

### Qué se decidió

En lugar de la cámara (que se había retirado del alcance), se construyó un
simulador de generación y ahorro con una gráfica SVG de doce barras. El criterio
fue que una fotografía del techo no cambia ninguna decisión dentro de la
aplicación, mientras que la generación estimada **es** el argumento de venta de
un sistema solar.

La gráfica se dibujó a mano en SVG en lugar de usar una librería: una librería de
graficado pesa más que toda la aplicación compilada.

### Qué hubo que corregir

Con las 28 comprobaciones automáticas ya en verde, el retorno de inversión salía
en **1.4 años**, cuando un sistema solar residencial real se paga entre cuatro y
siete. Se verificó el cálculo contra los precios reales de la base de datos y el
modelo estaba bien: el carrito de prueba solo tenía paneles, sin estructura,
inversor ni instalación, que son cerca de la mitad del costo.

No era un error de programación, pero sí un dato que habría engañado al cliente.
Se agregó un aviso que advierte qué piezas faltan. Con el sistema completo el
retorno pasa a **4.1 años**.

También se detectó, mirando una captura, que las etiquetas del eje salían tres
veces más grandes de lo debido: el texto de un SVG escala junto con el dibujo.
Ninguna comprobación lo vio porque todas medían el DOM, no el tamaño pintado.

### Aprendizaje

Una suite en verde no garantiza que el dato sea correcto, solo que el código hace
lo que se le pidió. Hay que revisar si lo que se le pidió tiene sentido.

---

## Prompt 10 — Revisión final antes de la evaluación

### Prompt utilizado

> [Lista de requisitos de la evaluación final]

### Qué se encontró al auditar

Revisar el proyecto contra la lista de requisitos, en lugar de darlo por hecho,
sacó a la luz cinco cosas:

| Hallazgo | Estado |
|---|---|
| Dos pruebas unitarias fallaban | Corregido |
| La app se llamaba «Photo Gallery Cap Ng» en el teléfono | Renombrada a SolarApp |
| `api.service.ts` y `explore-container` eran código muerto | Eliminados |
| Los endpoints de `usuarios.php` no estaban documentados | Documentados |
| No existía el APK | Generado y verificado |

De las dos pruebas que fallaban, **ninguna era un fallo de la aplicación**: una
era contaminación de estado entre pruebas (la sesión guardada en `localStorage`
sobrevivía de un test al siguiente) y la otra buscaba un selector que había
quedado obsoleto cuando el mensaje de error se movió al panel de diagnóstico.

### Aprendizaje

Una prueba que falla no siempre señala un fallo del programa, pero **siempre
señala algo**: en este caso, que la suite no se había actualizado al ritmo de la
aplicación.

---

## Resumen general

| Aspecto | Detalle |
|---------|---------|
| **Código aceptado** | Estructura HTML convertida desde Pug; manejo de CORS con preflight `OPTIONS`; `UPDATE` dinámico para `PATCH`; consultas preparadas con PDO; diseño con CSS Grid y su breakpoint responsivo. |
| **Código modificado** | Mixins de Compass → `transition` estándar; división `/` de Sass → `math.div()`; `lighten()`/`darken()` → `color.adjust()`; ancho fijo de los botones; colores de los campos de formulario; color de texto sobrescrito por el tema de Ionic; mensaje de error del login unificado por seguridad. |
| **Código descartado** | Todo el código jQuery del diseño original, por ser incompatible con el modelo de Angular; los hashes de contraseña inventados en el script SQL, que impedían iniciar sesión. |

### Observación sobre el uso de IA

La IA resultó muy útil para **traducir** entre lenguajes (Pug a HTML, Sass indentado
a SCSS, jQuery a Angular) y para generar código repetitivo como los métodos de la
API.

Sin embargo, quedó claro que **no se puede confiar en el código generado sin
verificarlo en ejecución**. Los errores más serios no aparecían al leer el código:

- Los hashes de contraseña inventados se veían perfectamente válidos, pero hacían
  imposible iniciar sesión.
- Los problemas de color y de ancho de los botones solo se detectaron al abrir la
  aplicación y observar el resultado.

La conclusión es que la IA acelera bastante la escritura, pero la revisión y las
pruebas siguen siendo responsabilidad del programador.

### Lo que confirmó la Unidad II

Esa conclusión se sostuvo durante todo el cuatrimestre, y se volvió más precisa.
Los fallos que costaron más tiempo **no fueron de sintaxis ni de lógica suelta**,
sino de tres tipos que solo se ven ejecutando:

| Tipo de fallo | Ejemplo | Cómo se detectó |
|---|---|---|
| **De orden** | Comprobar si hay pendientes antes de leerlos del disco | Prueba automatizada |
| **De momento** | Activar el indicador de carga después de dos `await` | Mirando la pantalla |
| **De sentido** | Un retorno de inversión de 1.4 años, calculado correctamente | Dudando de una cifra que ninguna prueba marcaba |

El tercero es el que ninguna herramienta detecta: el código hacía exactamente lo
que se le pidió, y aun así el resultado habría engañado al cliente.

### Método de trabajo adoptado

A partir de la entrega de resiliencia se fijó una regla: **verificar en la
aplicación real antes de dar algo por terminado**. En la práctica significó
manejar la aplicación desde fuera con el protocolo de depuración de Chrome y
revisar las capturas una por una.

Eso tuvo un efecto secundario útil: en varias ocasiones **la prueba estaba mal y
el programa bien**. Pasó con el selector obsoleto del mensaje de error, con la
contaminación de estado entre pruebas, y con una expresión regular que perdía su
barra invertida al atravesar las capas de comillas. En cada caso se comprobó la
aplicación a mano antes de tocar código que ya funcionaba.

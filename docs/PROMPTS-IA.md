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

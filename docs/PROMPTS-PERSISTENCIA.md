# Prompts utilizados — Entrega de persistencia

**Proyecto:** APPIonic — Aplicación base del cuatrimestre
**Autor:** David Martínez Mercado
**Materia:** Programación para Móviles II
**Herramienta utilizada:** Claude (Anthropic) mediante Claude Code en VS Code

---

## Contexto

Esta entrega partió de una aplicación que ya funcionaba: login, CRUD de usuarios contra
una API en PHP, galería de fotos y una capa de datos organizada en `HttpService` +
`UsuarioRepository`.

El trabajo con IA consistió en **analizar el código existente antes de escribir nada**,
decidir dónde faltaba realmente la persistencia, y después implementar. El orden importa:
el primer prompt no pidió código, pidió diagnóstico.

---

## Prompt 1 — Análisis del código y decisión de alcance

### Prompt utilizado

> "ahora esto analiza el codigo e implementa esto, los entregables van en el documento
> basate en los que hay en la carpeta docs: *Agregar persistencia para evitar que la
> información desaparezca al cerrar la aplicación. Puede utilizarse, según el proyecto:
> Ionic Storage, Preferences, SQLite, almacenamiento de archivos o alguna tecnología
> equivalente aprobada. Entregarán: aplicación funcional; alta, consulta, modificación y
> eliminación de información persistente; video corto demostrando que los datos permanecen
> después de cerrar/reabrir la aplicación; código en repositorio; prompts relevantes
> utilizados durante la implementación.*"

### Qué hizo la IA antes de programar

En lugar de empezar a escribir un servicio de almacenamiento, primero leyó los archivos
del proyecto (`models/`, `services/`, las tres pestañas) y encontró un hecho que cambió
el enfoque de la entrega:

**La aplicación ya tenía persistencia, pero solo en un módulo.** `PhotoService` usaba
`Preferences` + `Filesystem` desde la plantilla oficial de Ionic. Lo que faltaba era
persistencia en la parte propia del proyecto.

El diagnóstico que devolvió fue este:

| Módulo | Estado antes | Problema |
|---|---|---|
| Fotos (`tab2`) | Ya persistía | Ninguno |
| Sesión (`tab1`) | Solo en memoria | Al cerrar la app había que volver a hacer login |
| Usuarios (`tab3`) | Solo en MySQL | Con XAMPP apagado, pantalla en blanco |

### Decisión tomada

La IA planteó tres alcances posibles y se eligió el más completo:

1. Sesión persistente + caché offline de usuarios.
2. Una entidad nueva 100% local con CRUD propio.
3. **Las dos cosas** ← la opción elegida.

Se eligió la tercera porque cada una demuestra algo distinto: la entidad local cumple de
forma literal el "alta, consulta, modificación y eliminación de información persistente",
mientras que la sesión y la caché muestran persistencia aplicada a un problema real de la
app que ya existía.

### Aprendizaje

Pedirle a la IA que **analice antes de implementar** evitó trabajo duplicado. Si se le
hubiera pedido directamente "agrega Ionic Storage", habría instalado una dependencia
nueva para hacer lo que `Preferences` ya hacía en el proyecto.

---

## Prompt 2 — Elección de la tecnología de almacenamiento

### Contexto de la decisión

La consigna permitía Ionic Storage, Preferences, SQLite o almacenamiento de archivos. Se
analizó cuál correspondía a este proyecto en lugar de tomar la primera de la lista.

### Criterios que se aplicaron

**Se eligió `@capacitor/preferences`** por tres razones:

1. **Ya estaba instalada.** Aparecía en `package.json` y `PhotoService` la usaba. Meter
   Ionic Storage habría añadido una dependencia para resolver un problema resuelto.
2. **Multiplataforma sin cambiar código.** Usa `SharedPreferences` en Android,
   `UserDefaults` en iOS y `localStorage` en el navegador.
3. **El volumen de datos es pequeño.** SQLite se justifica con miles de registros o
   consultas con `JOIN`; aquí son una sesión, una lista y unas notas de texto.

### Limitación detectada y cómo se resolvió

La IA señaló que **Preferences guarda texto plano, sin cifrar**. De ahí salió una regla de
diseño concreta: nunca guardar la contraseña en el dispositivo. Solo se persiste el objeto
`Usuario` que devuelve la API, que ya viene sin el campo `password` porque el PHP lo
elimina con `unset($fila['password'])`.

Este punto no estaba en la consigna; salió de revisar la implicación de seguridad de la
tecnología elegida.

---

## Prompt 3 — Implementación de la capa de persistencia

### Qué se pidió

Implementar los tres frentes acordados, respetando la arquitectura que ya tenía el
proyecto en lugar de inventar una nueva.

### Decisiones de diseño aplicadas

**1. Una capa base, igual que con HTTP.**

El proyecto ya separaba transporte (`HttpService`) de entidad (`UsuarioRepository`). Se
replicó ese patrón: `StorageService` es el único que conoce Preferences, y los
repositorios se apoyan en él sin repetir `JSON.parse` / `JSON.stringify`.

**2. Protección contra datos corruptos.**

```typescript
try {
  return JSON.parse(value) as T;
} catch {
  await this.eliminar(clave);
  return null;
}
```

Sin este `try/catch`, un valor guardado con un formato anterior haría que `JSON.parse`
lanzara una excepción **durante el arranque** y la aplicación no abriría. Descartar el
dato corrupto es preferible a dejar la app inutilizable.

**3. La caché no oculta los errores.**

Al fallar la petición, el repositorio carga la copia local **pero vuelve a lanzar el
error**:

```typescript
} catch (e) {
  await this.cargarCache();
  throw e;
}
```

Así la vista sigue mostrando el mensaje de fallo y aparece un aviso de que los datos son
locales, con la fecha de la última sincronización. La alternativa — tragarse el error —
habría hecho que el usuario confundiera datos viejos con datos actuales.

**4. Persistir antes de terminar la operación.**

En `NotaRepository`, cada método hace `await this.persistir()` antes de devolver el
control. Si la aplicación se cierra en el instante siguiente, el dato ya está en disco.

**5. El `id` lo genera el cliente.**

Sin base de datos no hay `AUTO_INCREMENT`, así que se combina la marca de tiempo (que da
el orden) con un sufijo aleatorio que evita choques si se crean dos notas en el mismo
milisegundo.

### Verificación realizada

```bash
npm run build   # compilo sin errores, tab4-page aparece como chunk
npm run lint    # 10 errores, TODOS preexistentes en tab1.page.html
```

Se comprobó con `git diff` que `tab1.page.html` no fue modificado en esta entrega: los
errores de accesibilidad venían de la plantilla original y no se introdujeron aquí.

---

## Prompt 4 — Problema de entorno detectado al ejecutar

### Qué ocurrió

Al intentar levantar el servidor con `npm start`, falló:

```
Node.js version v24.13.1 detected.
The Angular CLI requires a minimum Node.js version of v22.22.3 or v24.15.0 or >=26.0.0
```

La aplicación había funcionado antes, así que se pidió a la IA diagnosticar el cambio en
lugar de tocar el proyecto.

### Diagnóstico

Revisando el historial de git y las fechas de los archivos:

| Qué | Cuándo | Estado |
|---|---|---|
| `package.json` (incluido `engines`) | commit `aa67450` | Sin cambios, `git diff` vacío |
| Angular CLI 22.0.5 en `node_modules` | 3 sep 2025 | Sin tocar |
| **`node.exe`** | **14 feb 2026** | **Reinstalado** |

**El proyecto no se rompió: se actualizó Node por debajo.** La versión instalada
(v24.13.1) quedó dos parches por debajo de la que exige Angular 22 dentro de esa línea.

### Solución aplicada

```bash
winget install CoreyButler.NVMforWindows
nvm install 24.15.0
nvm use 24.15.0
```

Se instaló **nvm-windows** en lugar de reemplazar Node directamente, para poder tener
varias versiones y que una actualización del sistema no vuelva a tumbar el entorno. La
versión anterior sigue disponible con `nvm use 24.13.1`.

### Aprendizaje

Cuando algo "antes funcionaba y ahora no", conviene comparar el estado del proyecto con el
del entorno antes de modificar código. Aquí el repositorio estaba intacto y el cambio
estaba fuera de él.

---

## Resumen general

| Prompt | Propósito | Resultado |
|---|---|---|
| 1 | Analizar el código y decidir el alcance | Se descubrió que las fotos ya persistían; se definieron tres frentes |
| 2 | Elegir la tecnología | Preferences, con la regla de no guardar contraseñas |
| 3 | Implementar | 7 archivos nuevos, 9 modificados, compilación limpia |
| 4 | Diagnosticar un fallo de ejecución | El problema era la versión de Node, no el proyecto |

### Observación sobre el uso de IA

Lo más útil no fue la generación de código, sino el **análisis previo**. Dos de los cuatro
prompts no produjeron una sola línea de programa: uno sirvió para descubrir que parte del
trabajo ya estaba hecho, y otro para demostrar que un fallo de arranque no tenía nada que
ver con el código.

También hubo que validar lo que la IA proponía. El caso más claro fue el de los errores de
lint: al revisarlos se confirmó con `git diff` que pertenecían a una plantilla que esta
entrega no tocó, en lugar de asumir que los había introducido el código nuevo.

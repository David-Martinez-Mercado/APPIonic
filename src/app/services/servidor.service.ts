import { Injectable, inject, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { OrigenDatos, ORIGEN_PREDETERMINADO } from '../models';

/**
 * Origen de datos: a donde apunta la aplicacion.
 *
 * La aplicacion se instala en un telefono y el servidor vive en otra
 * maquina de la misma red, asi que la direccion no puede estar fija en
 * el codigo. Aqui se guarda, como JSON, la que el usuario escribe en la
 * pantalla de acceso, y sobrevive al cierre de la aplicacion.
 *
 * Solo se configura el host de Apache (puerto 80). MySQL (3306) NO se
 * toca desde el telefono: el PHP se conecta a la base de datos en el
 * propio servidor, por localhost. Exponer 3306 a la red seria abrir la
 * base de datos a cualquiera que la alcance.
 *
 *   Telefono  --HTTP:80-->  Apache + PHP  --localhost:3306-->  MySQL
 */
@Injectable({ providedIn: 'root' })
export class ServidorService {
  private storage = inject(StorageService);

  /** Clave del JSON completo en el dispositivo. */
  private static readonly CLAVE = 'origen_datos';

  /** Puerto de Apache. Fijo: es el estandar de HTTP y el de XAMPP. */
  static readonly PUERTO_HTTP = 80;

  /** Puerto de MySQL, solo informativo. Ver la nota de arriba. */
  static readonly PUERTO_MYSQL = 3306;

  /**
   * Configuracion completa, tal como se guarda en el dispositivo.
   *
   * Se expone el objeto entero y no solo el host para que la pantalla
   * de origenes de datos pueda mostrarlo sin tener que reconstruirlo.
   */
  readonly origen = signal<OrigenDatos>({ ...ORIGEN_PREDETERMINADO });

  /** true cuando ya se leyo el dispositivo. */
  readonly cargado = signal(false);

  /** Atajo: la direccion, que es lo que se edita en la pantalla. */
  readonly host = computed(() => this.origen().host);

  /** Base de las URLs: protocolo://host[:puerto] */
  readonly base = computed(() => {
    const o = this.origen();
    // El 80 no se escribe: es el puerto que HTTP usa por omision y
    // ponerlo solo haria la URL mas larga.
    const puerto = o.puertoHttp === 80 ? '' : `:${o.puertoHttp}`;
    return `${o.protocolo}://${o.host}${puerto}`;
  });

  // Las vistas y los repositorios leen estas, no environment: asi la
  // direccion cambia sin recompilar ni reiniciar la aplicacion.
  readonly usuariosUrl = computed(
    () => `${this.base()}${this.origen().rutaApi}/usuarios.php`,
  );
  readonly productosUrl = computed(
    () => `${this.base()}${this.origen().rutaApi}/productos.php`,
  );
  readonly pedidosUrl = computed(
    () => `${this.base()}${this.origen().rutaApi}/pedidos.php`,
  );

  /** Endpoint ligero para comprobar que el servidor responde. */
  readonly pingUrl = computed(() => this.productosUrl());

  /** El JSON con sangria, para mostrarlo en la pantalla de origenes. */
  readonly json = computed(() => JSON.stringify(this.origen(), null, 2));

  private restauracion: Promise<OrigenDatos> | null = null;

  // ------------------------------------------------------------
  //  Lectura
  // ------------------------------------------------------------

  /**
   * Lee la configuracion guardada.
   *
   * Devuelve la misma promesa si ya hay una lectura en curso, para que
   * varias vistas que arranquen a la vez no lean el dispositivo varias
   * veces ni se adelanten unas a otras.
   */
  restaurar(): Promise<OrigenDatos> {
    if (this.restauracion) {
      return this.restauracion;
    }

    this.restauracion = this.storage
      .obtener<OrigenDatos>(ServidorService.CLAVE)
      .then((guardado) => {
        if (guardado?.host) {
          // Se mezcla con el predeterminado: si una version anterior
          // guardo menos campos, los que falten toman su valor por
          // omision en lugar de quedar como undefined.
          this.origen.set({ ...ORIGEN_PREDETERMINADO, ...guardado });
        }
        this.cargado.set(true);
        return this.origen();
      });

    return this.restauracion;
  }

  /** Espera a que termine la restauracion inicial. */
  async listo(): Promise<void> {
    await this.restaurar();
  }

  // ------------------------------------------------------------
  //  Escritura
  // ------------------------------------------------------------

  /**
   * Guarda una direccion nueva.
   *
   * Se normaliza antes de guardarla: la gente escribe "192.168.1.195/",
   * "http://192.168.1.195" o con el puerto incluido, y las tres deben
   * acabar produciendo la misma URL.
   */
  async guardar(valor: string): Promise<OrigenDatos> {
    const { host, puerto } = descomponer(valor);

    if (!host) {
      throw new Error('Escribe la direccion del servidor.');
    }
    if (!esHostValido(host)) {
      throw new Error(
        'Direccion no valida. Escribe una IP como 192.168.1.195, ' +
          'un nombre de equipo, o localhost.',
      );
    }

    const nuevo: OrigenDatos = {
      ...this.origen(),
      host,
      puertoHttp: puerto ?? ServidorService.PUERTO_HTTP,
      actualizado_en: new Date().toISOString(),
    };

    await this.aplicar(nuevo);
    return nuevo;
  }

  /** Vuelve a la configuracion de fabrica. */
  async restablecer(): Promise<OrigenDatos> {
    const nuevo: OrigenDatos = {
      ...ORIGEN_PREDETERMINADO,
      actualizado_en: new Date().toISOString(),
    };

    this.origen.set(nuevo);
    this.restauracion = Promise.resolve(nuevo);
    await this.storage.eliminar(ServidorService.CLAVE);
    return nuevo;
  }

  // ------------------------------------------------------------
  //  Prueba de conexion
  // ------------------------------------------------------------

  /**
   * Comprueba que en esa direccion responda la API.
   *
   * No basta con que el equipo conteste: un servidor puede estar vivo y
   * no tener las APIs copiadas en htdocs. Por eso se valida que la
   * respuesta sea el JSON que esta aplicacion espera.
   *
   * Devuelve tambien las cabeceras y el estado, porque la pantalla de
   * origenes de datos los muestra para diagnosticar.
   */
  async probar(valor?: string): Promise<ResultadoPrueba> {
    const o = this.origen();
    let host = o.host;
    let puerto = o.puertoHttp;

    if (valor) {
      const d = descomponer(valor);
      host = d.host;
      puerto = d.puerto ?? ServidorService.PUERTO_HTTP;
    }

    if (!esHostValido(host)) {
      return {
        ok: false,
        mensaje: 'La direccion no tiene un formato valido.',
        url: valor ?? '',
      };
    }

    const sufijo = puerto === 80 ? '' : `:${puerto}`;
    const url = `${o.protocolo}://${host}${sufijo}${o.rutaApi}/productos.php`;

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 6000);
    const inicio = Date.now();

    try {
      const respuesta = await fetch(url, { signal: control.signal, cache: 'no-store' });
      const tardanza = Date.now() - inicio;

      const cabeceras: Record<string, string> = {};
      respuesta.headers.forEach((v, k) => (cabeceras[k] = v));

      if (!respuesta.ok) {
        return {
          ok: false,
          url,
          estado: respuesta.status,
          cabeceras,
          ms: tardanza,
          mensaje:
            `El servidor respondio ${respuesta.status}. Verifica que la carpeta ` +
            'api este copiada en htdocs.',
        };
      }

      const cuerpo = await respuesta.json();

      if (!cuerpo || typeof cuerpo.ok !== 'boolean') {
        return {
          ok: false,
          url,
          estado: respuesta.status,
          cabeceras,
          ms: tardanza,
          mensaje:
            'Hay un servidor en esa direccion, pero no respondio lo que esta ' +
            'aplicacion espera. Revisa que sea el XAMPP correcto.',
        };
      }

      const cuantos = Array.isArray(cuerpo.datos) ? cuerpo.datos.length : 0;

      return {
        ok: true,
        url,
        estado: respuesta.status,
        cabeceras,
        ms: tardanza,
        mensaje: `Conectado. El servidor respondio con ${cuantos} producto(s).`,
      };
    } catch (e) {
      // AbortError = se agoto el tiempo; el resto suele ser que no hay
      // nadie escuchando en esa direccion.
      const agotado = e instanceof DOMException && e.name === 'AbortError';

      return {
        ok: false,
        url,
        ms: Date.now() - inicio,
        mensaje: agotado
          ? 'El servidor no respondio a tiempo. Comprueba la IP y que ambos ' +
            'equipos esten en la misma red.'
          : 'No se pudo conectar. Verifica que Apache este iniciado y que el ' +
            'firewall permita el puerto 80.',
      };
    } finally {
      clearTimeout(temporizador);
    }
  }

  /** Guarda el resultado de la ultima prueba dentro del JSON. */
  async registrarPrueba(r: ResultadoPrueba): Promise<void> {
    await this.aplicar({
      ...this.origen(),
      ultimaPrueba: {
        ok: r.ok,
        mensaje: r.mensaje,
        fecha: new Date().toISOString(),
      },
    });
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  private async aplicar(nuevo: OrigenDatos): Promise<void> {
    this.origen.set(nuevo);
    this.restauracion = Promise.resolve(nuevo);
    await this.storage.guardar(ServidorService.CLAVE, nuevo);
  }
}

export interface ResultadoPrueba {
  ok: boolean;
  mensaje: string;
  /** URL exacta a la que se mando la peticion. */
  url: string;
  estado?: number;
  cabeceras?: Record<string, string>;
  /** Cuanto tardo, en milisegundos. */
  ms?: number;
}

/**
 * Separa "192.168.1.195:8080" en host y puerto.
 *
 * Quita el esquema, las barras y los espacios, porque la gente pega la
 * direccion de muchas formas distintas.
 */
function descomponer(valor: string): { host: string; puerto?: number } {
  const limpio = (valor ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  const [host, puerto] = limpio.split(':');

  if (puerto === undefined || puerto === '') {
    return { host };
  }

  const n = Number(puerto);
  return Number.isInteger(n) && n > 0 && n <= 65535
    ? { host, puerto: n }
    : { host: '' }; // puerto invalido: se descarta todo
}

/** Acepta IPv4, nombres de equipo y localhost. */
function esHostValido(host: string): boolean {
  if (!host) {
    return false;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const coincide = host.match(ipv4);

  if (coincide) {
    // Cada octeto tiene que caber en 0-255: "192.168.1.999" no vale.
    return coincide.slice(1).every((o) => Number(o) <= 255);
  }

  // Nombre de equipo o localhost.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host);
}

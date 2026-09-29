import { Injectable, inject, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { environment } from '../../environments/environment';

/**
 * Direccion del servidor donde corren las APIs.
 *
 * La aplicacion se instala en un telefono y el servidor vive en otra
 * maquina de la misma red, asi que la direccion no puede estar fija en
 * el codigo: cambia segun donde se conecte cada quien. Aqui se guarda
 * la que el usuario escribe en la pantalla de acceso, y sobrevive al
 * cierre de la aplicacion.
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

  private static readonly CLAVE = 'servidor_host';

  /** Puerto de Apache. Fijo: es el estandar de HTTP y el de XAMPP. */
  static readonly PUERTO_HTTP = 80;

  /**
   * Puerto de MySQL, solo informativo.
   *
   * Se muestra en la pantalla de configuracion para dejar claro que la
   * base de datos existe y en que puerto escucha, pero la aplicacion
   * nunca se conecta directamente a el.
   */
  static readonly PUERTO_MYSQL = 3306;

  /**
   * Host configurado: una IP, un nombre de equipo o localhost.
   *
   * Arranca con el valor del environment para que la aplicacion
   * funcione sin configurar nada cuando se prueba en la computadora.
   */
  readonly host = signal(hostDe(environment.apiUrl));

  /** true cuando ya se leyo el dispositivo. */
  readonly cargado = signal(false);

  /** Base de las URLs: http://<host> */
  readonly base = computed(() => `http://${this.host()}`);

  // Las vistas y los repositorios leen estas, no environment: asi la
  // direccion cambia sin recompilar ni reiniciar la aplicacion.
  readonly usuariosUrl = computed(() => `${this.base()}/api/usuarios.php`);
  readonly productosUrl = computed(() => `${this.base()}/api/productos.php`);
  readonly pedidosUrl = computed(() => `${this.base()}/api/pedidos.php`);

  /** Endpoint ligero para comprobar que el servidor responde. */
  readonly pingUrl = computed(() => `${this.base()}/api/productos.php`);

  private restauracion: Promise<string> | null = null;

  /**
   * Lee el host guardado.
   *
   * Devuelve la misma promesa si ya hay una lectura en curso, para que
   * varias vistas que arranquen a la vez no lean el dispositivo varias
   * veces ni se adelanten unas a otras.
   */
  restaurar(): Promise<string> {
    if (this.restauracion) {
      return this.restauracion;
    }

    this.restauracion = this.storage
      .obtener<string>(ServidorService.CLAVE)
      .then((guardado) => {
        if (guardado) {
          this.host.set(guardado);
        }
        this.cargado.set(true);
        return this.host();
      });

    return this.restauracion;
  }

  /** Espera a que termine la restauracion inicial. */
  async listo(): Promise<void> {
    await this.restaurar();
  }

  /**
   * Guarda una direccion nueva.
   *
   * Se normaliza antes de guardarla: la gente escribe "192.168.1.195/",
   * "http://192.168.1.195" o con el puerto incluido, y las tres deben
   * acabar produciendo la misma URL.
   */
  async guardar(valor: string): Promise<string> {
    const limpio = normalizar(valor);

    if (!limpio) {
      throw new Error('Escribe la direccion del servidor.');
    }
    if (!esHostValido(limpio)) {
      throw new Error(
        'Direccion no valida. Escribe una IP como 192.168.1.195, ' +
          'un nombre de equipo, o localhost.',
      );
    }

    this.host.set(limpio);
    this.restauracion = Promise.resolve(limpio);
    await this.storage.guardar(ServidorService.CLAVE, limpio);
    return limpio;
  }

  /** Vuelve al valor de compilacion. */
  async restablecer(): Promise<string> {
    const predeterminado = hostDe(environment.apiUrl);

    this.host.set(predeterminado);
    this.restauracion = Promise.resolve(predeterminado);
    await this.storage.eliminar(ServidorService.CLAVE);
    return predeterminado;
  }

  /**
   * Comprueba que en esa direccion responda la API.
   *
   * No basta con que el equipo conteste: un servidor puede estar vivo y
   * no tener las APIs copiadas en htdocs. Por eso se valida que la
   * respuesta sea el JSON que esta aplicacion espera.
   */
  async probar(valor?: string): Promise<ResultadoPrueba> {
    const host = valor ? normalizar(valor) : this.host();

    if (!esHostValido(host)) {
      return { ok: false, mensaje: 'La direccion no tiene un formato valido.' };
    }

    const url = `http://${host}/api/productos.php`;
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 6000);

    try {
      const respuesta = await fetch(url, { signal: control.signal, cache: 'no-store' });

      if (!respuesta.ok) {
        return {
          ok: false,
          mensaje:
            `El servidor respondio ${respuesta.status}. Verifica que la carpeta ` +
            '"api" este copiada en htdocs.',
        };
      }

      const cuerpo = await respuesta.json();

      if (!cuerpo || typeof cuerpo.ok !== 'boolean') {
        return {
          ok: false,
          mensaje:
            'Hay un servidor en esa direccion, pero no respondio lo que esta ' +
            'aplicacion espera. Revisa que sea el XAMPP correcto.',
        };
      }

      const cuantos = Array.isArray(cuerpo.datos) ? cuerpo.datos.length : 0;
      return {
        ok: true,
        mensaje: `Conectado. El servidor respondio con ${cuantos} producto(s).`,
      };
    } catch (e) {
      // AbortError = se agoto el tiempo; el resto suele ser que no hay
      // nadie escuchando en esa direccion.
      const agotado = e instanceof DOMException && e.name === 'AbortError';

      return {
        ok: false,
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
}

export interface ResultadoPrueba {
  ok: boolean;
  mensaje: string;
}

/**
 * Deja la direccion en la forma "host" o "host:puerto".
 *
 * Quita el esquema, las barras y los espacios, porque la gente pega la
 * direccion de muchas formas distintas.
 */
function normalizar(valor: string): string {
  return (valor ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    // El puerto 80 es el que se usa igualmente: escribirlo o no da lo mismo.
    .replace(/:80$/, '')
    .toLowerCase();
}

/** Acepta IPv4, nombres de equipo y localhost, con puerto opcional. */
function esHostValido(host: string): boolean {
  if (!host) {
    return false;
  }

  const [nombre, puerto] = host.split(':');

  if (puerto !== undefined) {
    const n = Number(puerto);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return false;
    }
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const coincide = nombre.match(ipv4);

  if (coincide) {
    // Cada octeto tiene que caber en 0-255: "192.168.1.999" no vale.
    return coincide.slice(1).every((o) => Number(o) <= 255);
  }

  // Nombre de equipo o localhost.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(nombre);
}

/** Extrae el host de una URL completa del environment. */
function hostDe(url: string): string {
  return normalizar(url.replace(/\/api\/.*$/, ''));
}

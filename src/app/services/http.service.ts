import { Injectable, inject } from '@angular/core';
import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  ApiError,
  RespuestaOk,
  RespuestaError,
  DiagnosticoPeticion,
} from '../models';
import { ConexionService } from './conexion.service';

/**
 * Capa de transporte.
 *
 * No sabe nada de usuarios ni de ninguna entidad en concreto: solo manda
 * peticiones HTTP, desenvuelve la respuesta de la API y convierte cualquier
 * fallo en un ApiError. Los repositorios se apoyan en esto para no repetir
 * el try/catch en cada operacion.
 *
 * Ademas es el unico punto donde se sabe si el servidor responde, asi que
 * desde aqui se mantiene informado a ConexionService: cada peticion que
 * sale bien o falla actualiza el estado que ven todas las pantallas.
 *
 * Cada fallo lleva adjunto un diagnostico (URL, payload, cabeceras,
 * estado de red) para que las vistas puedan mostrarlo en un modal: sin
 * eso, "no se pudo conectar" no dice si el problema es la IP, lo que se
 * envio o el servidor.
 */
@Injectable({ providedIn: 'root' })
export class HttpService {
  private conexion = inject(ConexionService);

  private http: AxiosInstance = axios.create({
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });

  /**
   * Cuantas veces se reintenta una peticion de lectura.
   *
   * Un fallo de red suele ser momentaneo (el wifi que parpadea, el
   * servidor que tarda). Reintentar un par de veces evita mostrar un
   * error por algo que se arregla solo en un segundo.
   */
  private static readonly REINTENTOS = 2;

  /** Espera entre reintentos, creciente: 400 ms, 800 ms. */
  private static readonly ESPERA_BASE = 400;

  async get<T>(url: string): Promise<T> {
    // Solo las lecturas se reintentan. Ver conReintentos().
    return this.conReintentos(
      async () => {
        const { data } = await this.http.get<RespuestaOk<T>>(url);
        return data.datos;
      },
      url,
      'GET',
    );
  }

  async post<T>(url: string, cuerpo: unknown): Promise<T> {
    return this.unaVez(
      async () => {
        const { data } = await this.http.post<RespuestaOk<T>>(url, cuerpo);
        return data.datos;
      },
      url,
      'POST',
      cuerpo,
    );
  }

  async put<T>(url: string, cuerpo: unknown): Promise<T> {
    return this.unaVez(
      async () => {
        const { data } = await this.http.put<RespuestaOk<T>>(url, cuerpo);
        return data.datos;
      },
      url,
      'PUT',
      cuerpo,
    );
  }

  async patch<T>(url: string, cuerpo: unknown): Promise<T> {
    return this.unaVez(
      async () => {
        const { data } = await this.http.patch<RespuestaOk<T>>(url, cuerpo);
        return data.datos;
      },
      url,
      'PATCH',
      cuerpo,
    );
  }

  async delete<T>(url: string): Promise<T> {
    return this.unaVez(
      async () => {
        const { data } = await this.http.delete<RespuestaOk<T>>(url);
        return data.datos;
      },
      url,
      'DELETE',
    );
  }

  // ------------------------------------------------------------
  //  Ejecucion
  // ------------------------------------------------------------

  /**
   * Ejecuta una peticion sin reintentar.
   *
   * Se usa en POST, PUT, PATCH y DELETE: reintentar una escritura es
   * peligroso. Si la peticion llego al servidor y la respuesta se
   * perdio de vuelta, un reintento crearia un segundo pedido sin que
   * el usuario lo sepa.
   */
  private async unaVez<T>(
    peticion: () => Promise<T>,
    url: string,
    metodo: string,
    payload?: unknown,
  ): Promise<T> {
    const inicio = Date.now();

    try {
      const datos = await peticion();
      this.conexion.registrarExito();
      return datos;
    } catch (e) {
      this.manejarError(e, { url, metodo, payload, inicio, intentos: 1 });
    }
  }

  /**
   * Ejecuta una peticion y la reintenta si el fallo fue de red.
   *
   * No se reintenta ante una respuesta del servidor: si contesto 404 o
   * 422, volver a preguntar dara exactamente lo mismo y solo retrasa
   * el aviso al usuario.
   */
  private async conReintentos<T>(
    peticion: () => Promise<T>,
    url: string,
    metodo: string,
  ): Promise<T> {
    const inicio = Date.now();
    let ultimo: unknown;
    let hechos = 0;

    for (let intento = 0; intento <= HttpService.REINTENTOS; intento++) {
      hechos = intento + 1;

      try {
        const datos = await peticion();
        this.conexion.registrarExito();
        return datos;
      } catch (e) {
        ultimo = e;

        const err = e as AxiosError;
        const fueDeRed = !err.response;

        if (!fueDeRed || intento === HttpService.REINTENTOS) {
          break;
        }

        // Espera creciente: si el servidor esta arrancando, darle mas
        // tiempo en cada vuelta tiene mas posibilidades de exito que
        // insistir de inmediato.
        await this.esperar(HttpService.ESPERA_BASE * Math.pow(2, intento));
      }
    }

    this.manejarError(ultimo, { url, metodo, inicio, intentos: hechos });
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolver) => setTimeout(resolver, ms));
  }

  // ------------------------------------------------------------
  //  Errores
  // ------------------------------------------------------------

  /**
   * Convierte cualquier fallo de axios en un ApiError con el mensaje que
   * mando el PHP, para no tener que revisar error.response en cada vista.
   *
   * El codigo 0 esta reservado para los fallos sin respuesta: es lo que
   * permite a las vistas distinguir "el servidor dijo que no" de "no se
   * pudo hablar con el servidor", que son problemas distintos.
   */
  private manejarError(e: unknown, ctx: ContextoPeticion): never {
    const err = e as AxiosError<RespuestaError>;

    const diagnostico: DiagnosticoPeticion = {
      url: ctx.url,
      metodo: ctx.metodo,
      payload: ctx.payload,
      ms: Date.now() - ctx.inicio,
      fecha: new Date().toISOString(),
      hayRed: this.conexion.hayRed(),
      tipoRed: this.conexion.tipoRed(),
      intentos: ctx.intentos,
    };

    if (err.response) {
      // El servidor respondio con 4xx o 5xx: esta vivo, contesto.
      this.conexion.registrarExito();

      const cuerpo = err.response.data;

      diagnostico.estado = err.response.status;
      diagnostico.respuesta = cuerpo;
      diagnostico.cabeceras = this.cabecerasDe(err.response.headers);

      throw new ApiError(
        cuerpo?.error ?? `Error ${err.response.status}`,
        cuerpo?.codigo ?? err.response.status,
        cuerpo?.detalles,
        diagnostico,
      );
    }

    // Sin respuesta: el problema es de conexion, no de la peticion.
    this.conexion.registrarFalloDeRed();

    if (err.code === 'ECONNABORTED') {
      throw new ApiError(
        'La peticion tardo demasiado y se cancelo. Revisa tu conexion e intenta de nuevo.',
        0,
        undefined,
        diagnostico,
      );
    }

    // Se usa el mensaje de ConexionService para que el aviso distinga
    // entre "no tienes internet" y "el servidor no responde".
    throw new ApiError(
      this.conexion.mensaje() ||
        'No se pudo conectar con el servidor. Verifica que Apache este iniciado en XAMPP.',
      0,
      undefined,
      diagnostico,
    );
  }

  /** Pasa las cabeceras de axios a un objeto plano que se pueda mostrar. */
  private cabecerasDe(cabeceras: unknown): Record<string, string> {
    const plano: Record<string, string> = {};

    if (cabeceras && typeof cabeceras === 'object') {
      for (const [clave, valor] of Object.entries(cabeceras)) {
        if (typeof valor === 'string' || typeof valor === 'number') {
          plano[clave] = String(valor);
        }
      }
    }
    return plano;
  }
}

/** Lo que se sabe de la peticion antes de saber como fallo. */
interface ContextoPeticion {
  url: string;
  metodo: string;
  payload?: unknown;
  inicio: number;
  intentos: number;
}

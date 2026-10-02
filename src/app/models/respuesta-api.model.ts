/**
 * Envoltura que usa la API en TODAS sus respuestas.
 *
 * El PHP nunca devuelve el objeto pelado: siempre lo mete dentro de "datos"
 * junto con una bandera "ok". Tenerlo tipado permite que el servicio HTTP
 * desenvuelva la respuesta una sola vez en lugar de hacerlo en cada llamada.
 */
export interface RespuestaOk<T> {
  ok: true;
  mensaje: string;
  datos: T;
}

export interface RespuestaError {
  ok: false;
  error: string;
  codigo: number;
  detalles?: unknown;
}

/**
 * Error ya traducido a algo que la vista puede mostrar directo.
 *
 * Guarda el codigo HTTP para poder distinguir casos en la interfaz
 * (por ejemplo 409 = usuario duplicado, 401 = credenciales incorrectas).
 */
export class ApiError extends Error {
  constructor(
    override message: string,
    public codigo: number,
    public detalles?: unknown,
    /**
     * Diagnostico tecnico de la peticion que fallo.
     *
     * Se adjunta para que las pantallas puedan mostrar en un modal a
     * donde se mando la solicitud, que se envio y que contesto el
     * servidor. Sin esto, un "no se pudo conectar" no dice si el
     * problema es la IP configurada, el payload o el servidor.
     */
    public diagnostico?: DiagnosticoPeticion,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Todo lo que se sabe de una peticion, para poder diagnosticarla. */
export interface DiagnosticoPeticion {
  /** URL completa a la que se mando. Incluye la IP configurada. */
  url: string;
  metodo: string;
  /** Lo que se envio en el cuerpo, si lo hubo. */
  payload?: unknown;
  /** Codigo HTTP. Ausente si la peticion no llego a tener respuesta. */
  estado?: number;
  /** Cabeceras que devolvio el servidor. */
  cabeceras?: Record<string, string>;
  /** Cuerpo crudo de la respuesta de error. */
  respuesta?: unknown;
  /** Cuanto tardo, en milisegundos. */
  ms?: number;
  /** Momento del intento, ISO 8601. */
  fecha: string;
  /** Si habia red segun el sistema operativo. */
  hayRed?: boolean;
  /** Tipo de conexion: wifi, cellular... */
  tipoRed?: string;
  /** Cuantos reintentos se hicieron antes de rendirse. */
  intentos?: number;
}

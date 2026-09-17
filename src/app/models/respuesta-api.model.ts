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
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

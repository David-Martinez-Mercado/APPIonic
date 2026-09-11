import { Injectable } from '@angular/core';
import axios, { AxiosInstance, AxiosError } from 'axios';

/** Usuario tal como lo devuelve la API (sin el password). */
export interface Usuario {
  id: number;
  username: string;
  email: string;
  full_name: string;
  activo: number;
  creado_en: string;
  actualizado_en: string;
}

/** Envoltura que usa la API en todas sus respuestas. */
interface RespuestaOk<T> {
  ok: true;
  mensaje: string;
  datos: T;
}

interface RespuestaError {
  ok: false;
  error: string;
  codigo: number;
  detalles?: unknown;
}

/** Error ya traducido a algo que la vista puede mostrar directo. */
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

@Injectable({ providedIn: 'root' })
export class ApiService {
  /**
   * En el navegador (ng serve) localhost funciona.
   * Desde el emulador de Android hay que usar 10.0.2.2, y desde un
   * celular fisico la IP de tu computadora en la red (ej. 192.168.1.70).
   */
  private readonly baseUrl = 'http://localhost/api/usuarios.php';

  private http: AxiosInstance = axios.create({
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });

  /**
   * Convierte cualquier fallo de axios en un ApiError con el mensaje que
   * mando el PHP, para no tener que revisar error.response en cada vista.
   */
  private manejarError(e: unknown): never {
    const err = e as AxiosError<RespuestaError>;

    if (err.response) {
      // El servidor respondio con 4xx o 5xx
      const cuerpo = err.response.data;
      throw new ApiError(
        cuerpo?.error ?? `Error ${err.response.status}`,
        cuerpo?.codigo ?? err.response.status,
        cuerpo?.detalles,
      );
    }

    if (err.code === 'ECONNABORTED') {
      throw new ApiError('La peticion tardo demasiado. Intenta de nuevo.', 0);
    }

    // No hubo respuesta: Apache apagado, sin red, o CORS bloqueado
    throw new ApiError(
      'No se pudo conectar con el servidor. Verifica que Apache este iniciado en XAMPP.',
      0,
    );
  }

  /** POST ?accion=login */
  async login(username: string, password: string): Promise<Usuario> {
    try {
      const { data } = await this.http.post<RespuestaOk<Usuario>>(
        `${this.baseUrl}?accion=login`,
        { username, password },
      );
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  /** GET (lista completa) */
  async listar(): Promise<Usuario[]> {
    try {
      const { data } = await this.http.get<RespuestaOk<Usuario[]>>(this.baseUrl);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  /** GET ?id= */
  async obtener(id: number): Promise<Usuario> {
    try {
      const { data } = await this.http.get<RespuestaOk<Usuario>>(`${this.baseUrl}?id=${id}`);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  /** POST (crear / registro) */
  async crear(usuario: {
    username: string;
    email: string;
    full_name: string;
    password: string;
  }): Promise<Usuario> {
    try {
      const { data } = await this.http.post<RespuestaOk<Usuario>>(this.baseUrl, usuario);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  /** PUT ?id= (reemplaza todo, exige todos los campos) */
  async reemplazar(
    id: number,
    usuario: { username: string; email: string; full_name: string; password: string; activo?: number },
  ): Promise<Usuario> {
    try {
      const { data } = await this.http.put<RespuestaOk<Usuario>>(
        `${this.baseUrl}?id=${id}`,
        usuario,
      );
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  /** PATCH ?id= (actualiza solo lo que le mandes) */
  async actualizar(id: number, cambios: Partial<Usuario & { password: string }>): Promise<Usuario> {
    try {
      const { data } = await this.http.patch<RespuestaOk<Usuario>>(
        `${this.baseUrl}?id=${id}`,
        cambios,
      );
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  /** DELETE ?id= */
  async eliminar(id: number): Promise<Usuario> {
    try {
      const { data } = await this.http.delete<RespuestaOk<Usuario>>(`${this.baseUrl}?id=${id}`);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }
}

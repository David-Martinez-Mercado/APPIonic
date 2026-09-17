import { Injectable } from '@angular/core';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiError, RespuestaOk, RespuestaError } from '../models';

/**
 * Capa de transporte.
 *
 * No sabe nada de usuarios ni de ninguna entidad en concreto: solo manda
 * peticiones HTTP, desenvuelve la respuesta de la API y convierte cualquier
 * fallo en un ApiError. Los repositorios se apoyan en esto para no repetir
 * el try/catch en cada operacion.
 */
@Injectable({ providedIn: 'root' })
export class HttpService {
  private http: AxiosInstance = axios.create({
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });

  async get<T>(url: string): Promise<T> {
    try {
      const { data } = await this.http.get<RespuestaOk<T>>(url);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  async post<T>(url: string, cuerpo: unknown): Promise<T> {
    try {
      const { data } = await this.http.post<RespuestaOk<T>>(url, cuerpo);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  async put<T>(url: string, cuerpo: unknown): Promise<T> {
    try {
      const { data } = await this.http.put<RespuestaOk<T>>(url, cuerpo);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  async patch<T>(url: string, cuerpo: unknown): Promise<T> {
    try {
      const { data } = await this.http.patch<RespuestaOk<T>>(url, cuerpo);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

  async delete<T>(url: string): Promise<T> {
    try {
      const { data } = await this.http.delete<RespuestaOk<T>>(url);
      return data.datos;
    } catch (e) {
      this.manejarError(e);
    }
  }

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
}

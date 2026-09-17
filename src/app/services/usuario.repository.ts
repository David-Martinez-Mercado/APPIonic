import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpService } from './http.service';
import {
  Usuario,
  NuevoUsuario,
  UsuarioCompleto,
  CambiosUsuario,
  Credenciales,
} from '../models';

/**
 * Capa de acceso a datos de la entidad Usuario.
 *
 * Es lo unico del proyecto que sabe como estan armadas las URLs de la API.
 * Las vistas solo llaman metodos con nombre (listar, crear, eliminar...) y
 * nunca ven una cadena con "?accion=login" ni un verbo HTTP.
 *
 * Ademas guarda la lista en un signal que se mantiene al dia sola: despues
 * de crear o borrar no hace falta volver a pedirle todo al servidor.
 */
@Injectable({ providedIn: 'root' })
export class UsuarioRepository {
  private http = inject(HttpService);
  private readonly url = environment.apiUrl;

  /** Cache reactiva. La vista la lee directo y se repinta sola al cambiar. */
  readonly usuarios = signal<Usuario[]>([]);

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /** GET - lista completa. */
  async listar(): Promise<Usuario[]> {
    const usuarios = await this.http.get<Usuario[]>(this.url);
    this.usuarios.set(usuarios);
    return usuarios;
  }

  /** GET ?id= - un solo usuario. */
  async obtener(id: number): Promise<Usuario> {
    return this.http.get<Usuario>(`${this.url}?id=${id}`);
  }

  // ------------------------------------------------------------
  //  CREATE
  // ------------------------------------------------------------

  /** POST - responde 201 con el usuario ya creado. */
  async crear(datos: NuevoUsuario): Promise<Usuario> {
    const creado = await this.http.post<Usuario>(this.url, datos);
    this.usuarios.update((lista) => [...lista, creado]);
    return creado;
  }

  // ------------------------------------------------------------
  //  UPDATE
  // ------------------------------------------------------------

  /** PUT ?id= - reemplaza el registro completo, exige todos los campos. */
  async reemplazar(id: number, datos: UsuarioCompleto): Promise<Usuario> {
    const actualizado = await this.http.put<Usuario>(`${this.url}?id=${id}`, datos);
    this.sustituirEnCache(actualizado);
    return actualizado;
  }

  /** PATCH ?id= - actualiza solo los campos que se le manden. */
  async actualizar(id: number, cambios: CambiosUsuario): Promise<Usuario> {
    const actualizado = await this.http.patch<Usuario>(`${this.url}?id=${id}`, cambios);
    this.sustituirEnCache(actualizado);
    return actualizado;
  }

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  /** DELETE ?id= - devuelve el usuario que se borro. */
  async eliminar(id: number): Promise<Usuario> {
    const eliminado = await this.http.delete<Usuario>(`${this.url}?id=${id}`);
    this.usuarios.update((lista) => lista.filter((u) => u.id !== id));
    return eliminado;
  }

  // ------------------------------------------------------------
  //  Autenticacion
  // ------------------------------------------------------------

  /** POST ?accion=login - no toca la cache, no es una operacion del CRUD. */
  async login(credenciales: Credenciales): Promise<Usuario> {
    return this.http.post<Usuario>(`${this.url}?accion=login`, credenciales);
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  /** Cambia un usuario de la cache respetando el orden de la lista. */
  private sustituirEnCache(usuario: Usuario): void {
    this.usuarios.update((lista) =>
      lista.map((u) => (u.id === usuario.id ? usuario : u)),
    );
  }
}

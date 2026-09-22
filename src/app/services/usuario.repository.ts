import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpService } from './http.service';
import { StorageService } from './storage.service';
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
 *
 * Persistencia: la lista tambien se copia al almacenamiento del dispositivo
 * con Preferences. Sirve de cache offline, de modo que si XAMPP esta apagado
 * o no hay red la vista sigue mostrando los ultimos datos conocidos en lugar
 * de quedarse vacia. La fuente de verdad sigue siendo MySQL: la cache solo se
 * usa cuando el servidor no responde.
 */
@Injectable({ providedIn: 'root' })
export class UsuarioRepository {
  private http = inject(HttpService);
  private storage = inject(StorageService);
  private readonly url = environment.apiUrl;

  /** Clave de la cache offline en el dispositivo. */
  private static readonly CLAVE_CACHE = 'usuarios_cache';

  /** Clave con la fecha de la ultima sincronizacion correcta. */
  private static readonly CLAVE_SINCRO = 'usuarios_sincronizado';

  /** Cache reactiva. La vista la lee directo y se repinta sola al cambiar. */
  readonly usuarios = signal<Usuario[]>([]);

  /** true cuando lo que se muestra vino del disco y no del servidor. */
  readonly desdeCache = signal(false);

  /** Fecha ISO de la ultima sincronizacion correcta con la API. */
  readonly sincronizado = signal<string | null>(null);

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /**
   * GET - lista completa.
   *
   * Si el servidor responde, actualiza la cache del dispositivo. Si falla,
   * propaga el error para que la vista lo muestre, pero antes deja cargados
   * los datos que haya en disco: mas vale una lista vieja y avisada que una
   * pantalla en blanco.
   */
  async listar(): Promise<Usuario[]> {
    try {
      const usuarios = await this.http.get<Usuario[]>(this.url);

      this.usuarios.set(usuarios);
      this.desdeCache.set(false);
      await this.guardarCache(usuarios);
      return usuarios;
    } catch (e) {
      await this.cargarCache();
      throw e;
    }
  }

  /** Carga la lista guardada en el dispositivo, sin tocar la red. */
  async cargarCache(): Promise<Usuario[]> {
    const guardados = await this.storage.obtener<Usuario[]>(
      UsuarioRepository.CLAVE_CACHE,
    );

    if (guardados?.length) {
      this.usuarios.set(guardados);
      this.desdeCache.set(true);
    }

    this.sincronizado.set(
      await this.storage.obtener<string>(UsuarioRepository.CLAVE_SINCRO),
    );
    return guardados ?? [];
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
    await this.guardarCache(this.usuarios());
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
    await this.guardarCache(this.usuarios());
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
    // No se espera a que termine: la vista ya puede seguir, y el arreglo
    // completo se vuelve a escribir en la siguiente operacion de todos modos.
    void this.guardarCache(this.usuarios());
  }

  /** Escribe la lista y la marca de tiempo en el dispositivo. */
  private async guardarCache(usuarios: Usuario[]): Promise<void> {
    const ahora = new Date().toISOString();

    await this.storage.guardar(UsuarioRepository.CLAVE_CACHE, usuarios);
    await this.storage.guardar(UsuarioRepository.CLAVE_SINCRO, ahora);
    this.sincronizado.set(ahora);
  }
}

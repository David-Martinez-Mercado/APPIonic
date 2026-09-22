import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpService } from './http.service';
import { StorageService } from './storage.service';
import {
  Producto,
  NuevoProducto,
  CambiosProducto,
  CategoriaProducto,
} from '../models';

/**
 * Capa de acceso a datos del catalogo.
 *
 * Mismo patron que UsuarioRepository: es lo unico que sabe como estan
 * armadas las URLs, mantiene la lista en un signal y guarda una copia
 * en el dispositivo para que el catalogo siga navegable sin conexion.
 *
 * Que el catalogo funcione offline no es un lujo: un cliente puede
 * estar viendo paneles en una azotea sin senal.
 */
@Injectable({ providedIn: 'root' })
export class ProductoRepository {
  private http = inject(HttpService);
  private storage = inject(StorageService);
  private readonly url = environment.productosUrl;

  private static readonly CLAVE_CACHE = 'productos_cache';
  private static readonly CLAVE_SINCRO = 'productos_sincronizado';

  /** Cache reactiva. La vista la lee directo y se repinta sola. */
  readonly productos = signal<Producto[]>([]);

  /** true cuando lo mostrado vino del dispositivo y no del servidor. */
  readonly desdeCache = signal(false);

  /** Fecha ISO de la ultima sincronizacion correcta. */
  readonly sincronizado = signal<string | null>(null);

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /**
   * GET - catalogo completo.
   *
   * Si el servidor responde actualiza la copia local. Si falla, deja
   * cargado lo que haya en disco pero propaga el error para que la
   * vista pueda avisar de que los datos pueden estar desactualizados.
   */
  async listar(filtros?: { categoria?: CategoriaProducto; buscar?: string }): Promise<Producto[]> {
    const params = new URLSearchParams();

    if (filtros?.categoria) {
      params.set('categoria', filtros.categoria);
    }
    if (filtros?.buscar?.trim()) {
      params.set('buscar', filtros.buscar.trim());
    }

    const consulta = params.toString();
    const url = consulta ? `${this.url}?${consulta}` : this.url;

    try {
      const productos = await this.http.get<Producto[]>(url);

      this.productos.set(productos);
      this.desdeCache.set(false);

      // Solo se cachea el catalogo completo: guardar un resultado
      // filtrado haria creer despues que ese es todo el catalogo.
      if (!consulta) {
        await this.guardarCache(productos);
      }
      return productos;
    } catch (e) {
      await this.cargarCache();
      throw e;
    }
  }

  /** GET ?id= - un solo producto, incluso si esta dado de baja. */
  async obtener(id: number): Promise<Producto> {
    return this.http.get<Producto>(`${this.url}?id=${id}`);
  }

  /** GET ?todos=1 - incluye los desactivados. Para el panel de administracion. */
  async listarTodos(): Promise<Producto[]> {
    const productos = await this.http.get<Producto[]>(`${this.url}?todos=1`);
    this.productos.set(productos);
    this.desdeCache.set(false);
    return productos;
  }

  /** Carga el catalogo guardado en el dispositivo, sin tocar la red. */
  async cargarCache(): Promise<Producto[]> {
    const guardados = await this.storage.obtener<Producto[]>(
      ProductoRepository.CLAVE_CACHE,
    );

    if (guardados?.length) {
      this.productos.set(guardados);
      this.desdeCache.set(true);
    }

    this.sincronizado.set(
      await this.storage.obtener<string>(ProductoRepository.CLAVE_SINCRO),
    );
    return guardados ?? [];
  }

  // ------------------------------------------------------------
  //  CREATE / UPDATE / DELETE  (panel de administracion)
  // ------------------------------------------------------------

  /** POST - responde 201 con el producto ya creado. */
  async crear(datos: NuevoProducto): Promise<Producto> {
    const creado = await this.http.post<Producto>(this.url, datos);
    this.productos.update((lista) => [...lista, creado]);
    return creado;
  }

  /** PATCH ?id= - actualiza solo los campos enviados. */
  async actualizar(id: number, cambios: CambiosProducto): Promise<Producto> {
    const actualizado = await this.http.patch<Producto>(`${this.url}?id=${id}`, cambios);
    this.sustituirEnCache(actualizado);
    return actualizado;
  }

  /** PUT ?id= - reemplaza el registro completo. */
  async reemplazar(id: number, datos: NuevoProducto & { activo?: number }): Promise<Producto> {
    const actualizado = await this.http.put<Producto>(`${this.url}?id=${id}`, datos);
    this.sustituirEnCache(actualizado);
    return actualizado;
  }

  /** DELETE ?id= - baja logica; el producto sale del catalogo. */
  async eliminar(id: number): Promise<Producto> {
    const eliminado = await this.http.delete<Producto>(`${this.url}?id=${id}`);
    this.productos.update((lista) => lista.filter((p) => p.id !== id));
    return eliminado;
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  private sustituirEnCache(producto: Producto): void {
    this.productos.update((lista) =>
      lista.map((p) => (p.id === producto.id ? producto : p)),
    );
  }

  private async guardarCache(productos: Producto[]): Promise<void> {
    const ahora = new Date().toISOString();

    await this.storage.guardar(ProductoRepository.CLAVE_CACHE, productos);
    await this.storage.guardar(ProductoRepository.CLAVE_SINCRO, ahora);
    this.sincronizado.set(ahora);
  }
}

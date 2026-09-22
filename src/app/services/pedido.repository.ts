import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpService } from './http.service';
import { StorageService } from './storage.service';
import {
  Pedido,
  NuevoPedido,
  CambioEstado,
  EstadoPedido,
} from '../models';

/**
 * Capa de acceso a datos de los pedidos.
 *
 * Los pedidos viven en MySQL: son el registro formal de un compromiso
 * entre el cliente y la empresa, y no pueden depender del dispositivo.
 * Se guarda una copia local solo para que el cliente pueda consultar
 * en que va su proyecto aunque no tenga senal.
 */
@Injectable({ providedIn: 'root' })
export class PedidoRepository {
  private http = inject(HttpService);
  private storage = inject(StorageService);
  private readonly url = environment.pedidosUrl;

  private static readonly CLAVE_CACHE = 'pedidos_cache';

  /** Lista actual: los del cliente, o todos si es administrador. */
  readonly pedidos = signal<Pedido[]>([]);

  /** Pedido abierto en la vista de detalle. */
  readonly seleccionado = signal<Pedido | null>(null);

  readonly desdeCache = signal(false);

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /** GET ?usuario_id= - los pedidos de un cliente. */
  async listarDeCliente(usuarioId: number): Promise<Pedido[]> {
    return this.listar(`${this.url}?usuario_id=${usuarioId}`, `${usuarioId}`);
  }

  /** GET - todos los pedidos. Vista de administracion. */
  async listarTodos(estado?: EstadoPedido): Promise<Pedido[]> {
    const url = estado ? `${this.url}?estado=${estado}` : this.url;
    // Un listado filtrado no se cachea: al recuperarlo pareceria que
    // esos son todos los pedidos que existen.
    return this.listar(url, estado ? null : 'admin');
  }

  /**
   * GET ?id= - un pedido con sus partidas y su bitacora.
   *
   * Es la consulta que alimenta la pantalla de seguimiento, donde el
   * cliente ve en que paso va su proyecto.
   */
  async obtener(id: number): Promise<Pedido> {
    const pedido = await this.http.get<Pedido>(`${this.url}?id=${id}`);
    this.seleccionado.set(pedido);
    return pedido;
  }

  /** Carga la copia local, sin tocar la red. */
  async cargarCache(clave: string): Promise<Pedido[]> {
    const guardados = await this.storage.obtener<Pedido[]>(
      `${PedidoRepository.CLAVE_CACHE}_${clave}`,
    );

    if (guardados?.length) {
      this.pedidos.set(guardados);
      this.desdeCache.set(true);
    }
    return guardados ?? [];
  }

  // ------------------------------------------------------------
  //  CREATE
  // ------------------------------------------------------------

  /**
   * POST - convierte el carrito en una solicitud.
   *
   * El servidor valida el stock, toma los precios del catalogo, calcula
   * los totales y asigna el folio. Si algo falla, no queda nada a
   * medias: el PHP lo hace dentro de una transaccion.
   */
  async crear(datos: NuevoPedido): Promise<Pedido> {
    const creado = await this.http.post<Pedido>(this.url, datos);
    this.pedidos.update((lista) => [creado, ...lista]);
    return creado;
  }

  // ------------------------------------------------------------
  //  UPDATE
  // ------------------------------------------------------------

  /**
   * PATCH ?accion=estado - mueve el pedido a otro estado.
   *
   * Las transiciones validas las decide el servidor; aqui no se
   * duplica esa regla. Si se intenta un salto invalido, la API
   * responde 409 y el ApiError llega con el mensaje explicado.
   */
  async cambiarEstado(id: number, cambio: CambioEstado): Promise<Pedido> {
    const actualizado = await this.http.patch<Pedido>(
      `${this.url}?id=${id}&accion=estado`,
      cambio,
    );
    this.sustituirEnCache(actualizado);
    this.seleccionado.set(actualizado);
    return actualizado;
  }

  /** PATCH ?id= - edita fechas o notas sin mover el estado. */
  async actualizar(id: number, cambios: Partial<Pedido>): Promise<Pedido> {
    const actualizado = await this.http.patch<Pedido>(`${this.url}?id=${id}`, cambios);
    this.sustituirEnCache(actualizado);
    this.seleccionado.set(actualizado);
    return actualizado;
  }

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  /** DELETE ?id= - cancela la solicitud; el registro se conserva. */
  async cancelar(id: number): Promise<Pedido> {
    const cancelado = await this.http.delete<Pedido>(`${this.url}?id=${id}`);
    this.sustituirEnCache(cancelado);
    this.seleccionado.set(cancelado);
    return cancelado;
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  /** Pide la lista y, si falla, deja cargada la copia del dispositivo. */
  private async listar(url: string, claveCache: string | null): Promise<Pedido[]> {
    try {
      const pedidos = await this.http.get<Pedido[]>(url);

      this.pedidos.set(pedidos);
      this.desdeCache.set(false);

      if (claveCache) {
        await this.storage.guardar(
          `${PedidoRepository.CLAVE_CACHE}_${claveCache}`,
          pedidos,
        );
      }
      return pedidos;
    } catch (e) {
      if (claveCache) {
        await this.cargarCache(claveCache);
      }
      throw e;
    }
  }

  private sustituirEnCache(pedido: Pedido): void {
    this.pedidos.update((lista) =>
      lista.map((p) => (p.id === pedido.id ? { ...p, ...pedido } : p)),
    );
  }
}

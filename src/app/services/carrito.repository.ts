import { Injectable, inject, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import {
  ItemCarrito,
  Producto,
  TotalesCarrito,
  TASA_IVA,
} from '../models';

/**
 * Carrito del cliente, guardado en el dispositivo.
 *
 * Es el sucesor directo de NotaRepository de la entrega anterior: la
 * misma idea de entidad 100% local con Capacitor Preferences, aplicada
 * a un caso de uso real. Toda operacion escribe en disco antes de
 * terminar, de modo que si la aplicacion se cierra el carrito sigue ahi.
 *
 * El carrito NO viaja a la API mientras se arma. Solo al enviar la
 * solicitud se convierte en un pedido del servidor.
 */
@Injectable({ providedIn: 'root' })
export class CarritoRepository {
  private storage = inject(StorageService);

  private static readonly CLAVE = 'carrito';

  /** Contenido del carrito. La vista lo lee directo. */
  readonly items = signal<ItemCarrito[]>([]);

  /** true cuando ya se leyo el disco al menos una vez. */
  readonly cargado = signal(false);

  /** Piezas totales. Alimenta el globo del icono de la pestana. */
  readonly piezas = computed(() =>
    this.items().reduce((suma, i) => suma + i.cantidad, 0),
  );

  readonly vacio = computed(() => this.items().length === 0);

  /**
   * Totales con IVA.
   *
   * Se calculan aqui y no en la vista para que el carrito y el resumen
   * de la solicitud no puedan mostrar cifras distintas. El servidor los
   * vuelve a calcular al crear el pedido: estos son informativos.
   */
  readonly totales = computed<TotalesCarrito>(() => {
    const items = this.items();
    const subtotal = items.reduce((suma, i) => suma + i.precio * i.cantidad, 0);
    const iva = Math.round(subtotal * TASA_IVA * 100) / 100;

    return {
      piezas: items.reduce((suma, i) => suma + i.cantidad, 0),
      lineas: items.length,
      subtotal,
      iva,
      total: Math.round((subtotal + iva) * 100) / 100,
    };
  });

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /** Lee el carrito guardado. Se llama al arrancar la aplicacion. */
  async cargar(): Promise<ItemCarrito[]> {
    const guardado = await this.storage.obtener<ItemCarrito[]>(CarritoRepository.CLAVE);
    const items = guardado ?? [];

    this.items.set(items);
    this.cargado.set(true);
    return items;
  }

  /** Cuantas unidades de un producto hay en el carrito. */
  cantidadDe(productoId: number): number {
    return this.items().find((i) => i.producto_id === productoId)?.cantidad ?? 0;
  }

  // ------------------------------------------------------------
  //  CREATE / UPDATE
  // ------------------------------------------------------------

  /**
   * Agrega un producto o suma a la cantidad si ya estaba.
   *
   * Se copia el nombre, el precio y la imagen para poder pintar el
   * carrito sin conexion, sin tener que volver a pedir el catalogo.
   */
  async agregar(producto: Producto, cantidad = 1): Promise<ItemCarrito> {
    if (cantidad < 1) {
      throw new Error('La cantidad debe ser mayor que cero.');
    }

    const existente = this.items().find((i) => i.producto_id === producto.id);
    const nuevaCantidad = (existente?.cantidad ?? 0) + cantidad;

    if (nuevaCantidad > producto.stock) {
      throw new Error(
        `Solo hay ${producto.stock} ${producto.unidad}(s) de "${producto.nombre}" disponibles.`,
      );
    }

    if (existente) {
      await this.cambiarCantidad(producto.id, nuevaCantidad);
      return this.items().find((i) => i.producto_id === producto.id)!;
    }

    const item: ItemCarrito = {
      producto_id: producto.id,
      sku: producto.sku,
      nombre: producto.nombre,
      precio: producto.precio,
      imagen_url: producto.imagen_url,
      unidad: producto.unidad,
      categoria: producto.categoria,
      cantidad,
      agregado_en: new Date().toISOString(),
    };

    this.items.update((lista) => [...lista, item]);
    await this.persistir();
    return item;
  }

  /** Fija la cantidad exacta de una linea. Cero o menos la elimina. */
  async cambiarCantidad(productoId: number, cantidad: number): Promise<void> {
    if (cantidad <= 0) {
      await this.eliminar(productoId);
      return;
    }

    this.items.update((lista) =>
      lista.map((i) => (i.producto_id === productoId ? { ...i, cantidad } : i)),
    );
    await this.persistir();
  }

  /** Suma uno. Es el boton "+" de la vista. */
  async incrementar(productoId: number): Promise<void> {
    const item = this.items().find((i) => i.producto_id === productoId);
    if (item) {
      await this.cambiarCantidad(productoId, item.cantidad + 1);
    }
  }

  /** Resta uno; al llegar a cero la linea desaparece. */
  async decrementar(productoId: number): Promise<void> {
    const item = this.items().find((i) => i.producto_id === productoId);
    if (item) {
      await this.cambiarCantidad(productoId, item.cantidad - 1);
    }
  }

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  /** Quita una linea completa del carrito. */
  async eliminar(productoId: number): Promise<boolean> {
    const existia = this.items().some((i) => i.producto_id === productoId);

    if (!existia) {
      return false;
    }

    this.items.update((lista) => lista.filter((i) => i.producto_id !== productoId));
    await this.persistir();
    return true;
  }

  /**
   * Vacia el carrito.
   *
   * Se llama al enviar la solicitud correctamente y al cerrar sesion:
   * el carrito es de quien lo arma, no del dispositivo.
   */
  async vaciar(): Promise<void> {
    this.items.set([]);
    await this.persistir();
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  /** Convierte el carrito a las partidas que espera la API. */
  aItemsPedido(): { producto_id: number; cantidad: number }[] {
    // Solo se manda id y cantidad: el precio lo pone el servidor desde
    // el catalogo, para que nadie pueda pedir paneles a un peso.
    return this.items().map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
    }));
  }

  private async persistir(): Promise<void> {
    await this.storage.guardar(CarritoRepository.CLAVE, this.items());
  }
}

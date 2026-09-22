import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { ProductoRepository } from '../services/producto.repository';
import { CarritoRepository } from '../services/carrito.repository';
import {
  ApiError,
  Producto,
  CategoriaProducto,
  CATEGORIAS,
} from '../models';

/**
 * Catalogo de productos.
 *
 * Es la primera vista que ve el cliente. Puede mirar precios y agregar
 * al carrito sin iniciar sesion; la cuenta solo se pide al momento de
 * enviar la solicitud.
 */
@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    FormsModule,
    CurrencyPipe,
    DatePipe,
  ],
})
export class Tab2Page implements OnInit {
  private repo = inject(ProductoRepository);
  private carrito = inject(CarritoRepository);

  /** El catalogo vive en el repositorio; la vista solo lo lee. */
  productos = this.repo.productos;
  desdeCache = this.repo.desdeCache;
  sincronizado = this.repo.sincronizado;

  categorias = CATEGORIAS;

  // Signals: la app es zoneless, axios responde fuera de Angular.
  cargando = signal(false);
  mensajeError = signal('');
  mensajeOk = signal('');

  /** null = todas las categorias. */
  categoriaActiva = signal<CategoriaProducto | null>(null);
  busqueda = signal('');

  /**
   * Filtrado en el cliente y no con una peticion por tecla.
   *
   * El catalogo completo ya esta en memoria y son decenas de productos,
   * no miles: filtrar aqui responde al instante y ademas sigue
   * funcionando sin conexion.
   */
  visibles = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const categoria = this.categoriaActiva();

    return this.productos().filter((p) => {
      if (categoria && p.categoria !== categoria) {
        return false;
      }
      if (!termino) {
        return true;
      }
      return (
        p.nombre.toLowerCase().includes(termino) ||
        p.sku.toLowerCase().includes(termino) ||
        (p.descripcion ?? '').toLowerCase().includes(termino)
      );
    });
  });

  /** Para el contador "mostrando X de Y". */
  totalCatalogo = computed(() => this.productos().length);

  async ngOnInit() {
    // Primero lo que haya en el dispositivo, para pintar de inmediato;
    // luego se sincroniza con el servidor.
    await this.repo.cargarCache();
    await this.cargar();
  }

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------
  async cargar() {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      await this.repo.listar();
    } catch (e) {
      // El repositorio ya dejo cargada la copia local; solo se avisa.
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  // ------------------------------------------------------------
  //  Filtros
  // ------------------------------------------------------------
  filtrarPor(categoria: CategoriaProducto | null) {
    this.categoriaActiva.set(categoria);
  }

  limpiarBusqueda() {
    this.busqueda.set('');
    this.categoriaActiva.set(null);
  }

  // ------------------------------------------------------------
  //  Carrito
  // ------------------------------------------------------------

  /** Cuantas unidades de este producto ya hay en el carrito. */
  enCarrito(producto: Producto): number {
    return this.carrito.cantidadDe(producto.id);
  }

  async agregar(producto: Producto) {
    this.limpiarMensajes();

    if (producto.stock < 1) {
      this.mensajeError.set(`"${producto.nombre}" esta agotado.`);
      return;
    }

    try {
      await this.carrito.agregar(producto);
      this.mensajeOk.set(`"${producto.nombre}" agregado al carrito.`);
    } catch (e) {
      // El repositorio lanza un Error normal cuando no alcanza el stock.
      this.mensajeError.set(
        e instanceof Error ? e.message : 'No se pudo agregar el producto.',
      );
    }
  }

  async quitar(producto: Producto) {
    this.limpiarMensajes();
    await this.carrito.decrementar(producto.id);
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  /** Etiqueta legible de la categoria de un producto. */
  etiquetaCategoria(valor: string): string {
    return CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;
  }

  /** Imagen de respaldo cuando la URL falla o no hay conexion. */
  imagenFallo(evento: Event) {
    const img = evento.target as HTMLImageElement;
    img.style.display = 'none';
  }

  private mostrarError(e: unknown) {
    const msg = e instanceof ApiError ? e.message : 'Ocurrio un error inesperado.';
    const codigo = e instanceof ApiError && e.codigo ? ` (codigo ${e.codigo})` : '';
    this.mensajeError.set(msg + codigo);
  }

  private limpiarMensajes() {
    this.mensajeError.set('');
    this.mensajeOk.set('');
  }
}

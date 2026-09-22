import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { CarritoRepository } from '../services/carrito.repository';
import { PedidoRepository } from '../services/pedido.repository';
import { SesionService } from '../services/sesion.service';
import {
  ApiError,
  ItemCarrito,
  DatosSolicitud,
  SOLICITUD_VACIA,
} from '../models';

/**
 * Carrito y envio de la solicitud.
 *
 * El carrito vive en el dispositivo: se arma sin conexion y sobrevive
 * al cierre de la aplicacion. Solo al pulsar "Enviar solicitud" se
 * convierte en un pedido del servidor.
 */
@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    FormsModule,
    CurrencyPipe,
  ],
})
export class Tab3Page implements OnInit {
  private carrito = inject(CarritoRepository);
  private pedidos = inject(PedidoRepository);
  private sesion = inject(SesionService);
  private router = inject(Router);

  /** El carrito vive en el repositorio; la vista solo lo lee. */
  items = this.carrito.items;
  totales = this.carrito.totales;
  vacio = this.carrito.vacio;
  cargado = this.carrito.cargado;

  usuario = this.sesion.usuario;
  autenticado = this.sesion.autenticado;

  // Signals: la app es zoneless, axios responde fuera de Angular.
  enviando = signal(false);
  mensajeError = signal('');
  mensajeOk = signal('');

  /** Folio de la solicitud recien creada, para el mensaje de exito. */
  folioCreado = signal<string | null>(null);

  form: DatosSolicitud = { ...SOLICITUD_VACIA };

  /**
   * Un proyecto solar sin paneles no tiene sentido.
   *
   * No se bloquea el envio por esto: se avisa, porque puede que el
   * cliente solo quiera cotizar una bateria extra para un sistema que
   * ya tiene instalado.
   */
  sinPaneles = computed(
    () => !this.vacio() && !this.items().some((i) => i.categoria === 'panel'),
  );

  /** Aviso equivalente para la instalacion. */
  sinInstalacion = computed(
    () => !this.vacio() && !this.items().some((i) => i.categoria === 'instalacion'),
  );

  async ngOnInit() {
    // El carrito ya se cargo en la barra de pestanas al arrancar, pero
    // se vuelve a leer por si se entra directo a esta ruta.
    if (!this.cargado()) {
      await this.carrito.cargar();
    }
    // La sesion decide si se puede enviar la solicitud y precarga la
    // direccion del cliente, asi que hay que esperarla.
    await this.sesion.listo();
    this.precargarDatosDelUsuario();
  }

  // ------------------------------------------------------------
  //  Edicion de las lineas
  // ------------------------------------------------------------

  async incrementar(item: ItemCarrito) {
    this.limpiarMensajes();
    await this.carrito.incrementar(item.producto_id);
  }

  async decrementar(item: ItemCarrito) {
    this.limpiarMensajes();
    await this.carrito.decrementar(item.producto_id);
  }

  async eliminar(item: ItemCarrito) {
    if (!confirm(`Quitar "${item.nombre}" del carrito?`)) {
      return;
    }
    this.limpiarMensajes();
    await this.carrito.eliminar(item.producto_id);
  }

  async vaciar() {
    if (this.vacio()) {
      return;
    }
    if (!confirm('Vaciar todo el carrito?')) {
      return;
    }
    this.limpiarMensajes();
    await this.carrito.vaciar();
  }

  irAlCatalogo() {
    this.router.navigateByUrl('/tabs/tab2');
  }

  irAMisPedidos() {
    this.router.navigateByUrl('/tabs/tab4');
  }

  irAAcceder() {
    this.router.navigateByUrl('/tabs/tab1');
  }

  // ------------------------------------------------------------
  //  Envio de la solicitud
  // ------------------------------------------------------------

  async enviar() {
    if (this.enviando()) {
      return; // evita doble envio si dan doble clic
    }

    this.limpiarMensajes();

    const usuario = this.usuario();
    if (!usuario) {
      this.mensajeError.set('Inicia sesion para enviar tu solicitud.');
      return;
    }
    if (this.vacio()) {
      this.mensajeError.set('El carrito esta vacio.');
      return;
    }
    if (!this.form.direccion_instalacion.trim()) {
      this.mensajeError.set('La direccion de instalacion es obligatoria.');
      return;
    }

    this.enviando.set(true);
    try {
      const pedido = await this.pedidos.crear({
        usuario_id: usuario.id,
        direccion_instalacion: this.form.direccion_instalacion.trim(),
        ciudad: this.form.ciudad.trim() || undefined,
        telefono_contacto: this.form.telefono_contacto.trim() || undefined,
        notas_cliente: this.form.notas_cliente.trim() || undefined,
        items: this.carrito.aItemsPedido(),
      });

      // El carrito solo se vacia si el servidor confirmo: si fallara y
      // se hubiera vaciado antes, el cliente perderia su seleccion.
      await this.carrito.vaciar();

      this.folioCreado.set(pedido.folio);
      this.mensajeOk.set(
        `Solicitud ${pedido.folio} enviada. Un asesor la revisara y te contactara.`,
      );
      this.form = { ...SOLICITUD_VACIA };
      this.precargarDatosDelUsuario();
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.enviando.set(false);
    }
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  /** Importe de una linea. */
  importe(item: ItemCarrito): number {
    return item.precio * item.cantidad;
  }

  imagenFallo(evento: Event) {
    (evento.target as HTMLImageElement).style.display = 'none';
  }

  /**
   * Rellena el formulario con lo que ya sabemos del cliente.
   *
   * Se copian los datos de su cuenta como punto de partida; si la
   * instalacion es en otro domicilio, los puede cambiar.
   */
  private precargarDatosDelUsuario() {
    const u = this.usuario();
    if (!u) {
      return;
    }
    if (!this.form.direccion_instalacion && u.direccion) {
      this.form.direccion_instalacion = u.direccion;
    }
    if (!this.form.telefono_contacto && u.telefono) {
      this.form.telefono_contacto = u.telefono;
    }
  }

  private mostrarError(e: unknown) {
    const msg = e instanceof ApiError ? e.message : 'Ocurrio un error inesperado.';
    const codigo = e instanceof ApiError && e.codigo ? ` (codigo ${e.codigo})` : '';
    this.mensajeError.set(msg + codigo);
  }

  private limpiarMensajes() {
    this.mensajeError.set('');
    this.mensajeOk.set('');
    this.folioCreado.set(null);
  }
}

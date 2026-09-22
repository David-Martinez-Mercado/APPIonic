import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { PedidoRepository } from '../services/pedido.repository';
import { SesionService } from '../services/sesion.service';
import {
  ApiError,
  Pedido,
  EstadoPedido,
  FLUJO_PEDIDO,
  COLOR_ESTADO,
} from '../models';

/**
 * Seguimiento de las solicitudes del cliente.
 *
 * Es la vista que responde "en que va mi pedido": muestra la barra de
 * avance, las fechas que fijo el administrador y la bitacora completa
 * de lo que ha pasado con el proyecto.
 */
@Component({
  selector: 'app-tab4',
  templateUrl: 'tab4.page.html',
  styleUrls: ['tab4.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    CurrencyPipe,
    DatePipe,
  ],
})
export class Tab4Page implements OnInit {
  private repo = inject(PedidoRepository);
  private sesion = inject(SesionService);
  private router = inject(Router);

  pedidos = this.repo.pedidos;
  desdeCache = this.repo.desdeCache;
  usuario = this.sesion.usuario;
  autenticado = this.sesion.autenticado;

  cargando = signal(false);
  mensajeError = signal('');
  mensajeOk = signal('');

  /** Pedido abierto en el detalle. null = solo se ve la lista. */
  abierto = signal<Pedido | null>(null);

  /** Los seis pasos del avance, para pintar la linea de tiempo. */
  flujo = FLUJO_PEDIDO;

  /** Etiquetas de los pasos, en el mismo orden que el flujo. */
  readonly etiquetasFlujo: Record<EstadoPedido, string> = {
    solicitado: 'Solicitado',
    en_revision: 'En revision',
    aprobado: 'Aprobado',
    agendado: 'Agendado',
    en_instalacion: 'Instalando',
    completado: 'Completado',
    rechazado: 'Rechazado',
    cancelado: 'Cancelado',
  };

  /** Separa los que siguen su curso de los que ya terminaron. */
  enProceso = computed(() => this.pedidos().filter((p) => !p.es_final));
  cerrados = computed(() => this.pedidos().filter((p) => p.es_final));

  async ngOnInit() {
    // Se espera a que la sesion este leida del dispositivo: esta vista
    // se monta en paralelo con la barra de pestanas, y sin esperar
    // encontraria el usuario vacio aunque haya sesion guardada.
    await this.sesion.listo();
    await this.cargar();
  }

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------
  async cargar() {
    const usuario = this.usuario();

    if (!usuario) {
      // Sin sesion no hay pedidos que mostrar; la vista lo explica.
      return;
    }

    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      await this.repo.cargarCache(`${usuario.id}`);
      await this.repo.listarDeCliente(usuario.id);
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Abre el detalle: partidas, fechas e historial completo. */
  async abrir(pedido: Pedido) {
    this.limpiarMensajes();
    this.cargando.set(true);
    try {
      const completo = await this.repo.obtener(pedido.id);
      this.abierto.set(completo);
    } catch (e) {
      // Si no hay conexion se muestra lo que ya se tenia del listado,
      // aunque sin partidas ni bitacora.
      this.abierto.set(pedido);
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  cerrar() {
    this.abierto.set(null);
    this.limpiarMensajes();
  }

  // ------------------------------------------------------------
  //  Cancelar
  // ------------------------------------------------------------

  /** El cliente puede echarse para atras mientras no este instalando. */
  puedeCancelar(pedido: Pedido): boolean {
    return pedido.siguientes.includes('cancelado');
  }

  async cancelar(pedido: Pedido) {
    if (!confirm(`Cancelar la solicitud ${pedido.folio}?`)) {
      return;
    }

    this.limpiarMensajes();
    this.cargando.set(true);
    try {
      const cancelado = await this.repo.cancelar(pedido.id);
      this.abierto.set(cancelado);
      this.mensajeOk.set(`Solicitud ${pedido.folio} cancelada.`);
      await this.cargar();
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  // ------------------------------------------------------------
  //  Barra de avance
  // ------------------------------------------------------------

  /** Un paso esta cumplido si el pedido ya paso por el. */
  pasoCumplido(pedido: Pedido, paso: EstadoPedido): boolean {
    const indice = this.flujo.indexOf(paso);
    return !pedido.detenido && indice < pedido.paso;
  }

  /** El paso donde esta ahora mismo. */
  pasoActual(pedido: Pedido, paso: EstadoPedido): boolean {
    return !pedido.detenido && this.flujo.indexOf(paso) === pedido.paso - 1;
  }

  /** Clase de color para la etiqueta del estado. */
  colorEstado(pedido: Pedido): string {
    return COLOR_ESTADO[pedido.estado] ?? 'gris';
  }

  irAlCatalogo() {
    this.router.navigateByUrl('/tabs/tab2');
  }

  irAAcceder() {
    this.router.navigateByUrl('/tabs/tab1');
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

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

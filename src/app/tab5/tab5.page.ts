import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { PedidoRepository } from '../services/pedido.repository';
import { SesionService } from '../services/sesion.service';
import {
  ApiError,
  Pedido,
  EstadoPedido,
  CambioEstado,
  COLOR_ESTADO,
} from '../models';

/**
 * Panel de administracion.
 *
 * Aqui el administrador recibe las solicitudes, las revisa, las aprueba
 * o rechaza, y fija las fechas de visita tecnica e instalacion.
 *
 * Las transiciones validas las decide el servidor: esta vista solo
 * ofrece los botones que la API declara posibles en el campo
 * "siguientes" de cada pedido. Asi no hay dos copias de la regla.
 */
@Component({
  selector: 'app-tab5',
  templateUrl: 'tab5.page.html',
  styleUrls: ['tab5.page.scss'],
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
export class Tab5Page implements OnInit {
  private repo = inject(PedidoRepository);
  private sesion = inject(SesionService);
  private router = inject(Router);

  pedidos = this.repo.pedidos;
  usuario = this.sesion.usuario;

  cargando = signal(false);
  mensajeError = signal('');
  mensajeOk = signal('');

  /** Pedido abierto para gestionar. */
  abierto = signal<Pedido | null>(null);

  /** Filtro de la lista. null = todos. */
  filtro = signal<EstadoPedido | null>(null);

  /** Estado al que se quiere mover el pedido abierto. */
  destino = signal<EstadoPedido | null>(null);

  /** Campos del formulario de gestion. */
  form = {
    comentario: '',
    motivo_rechazo: '',
    fecha_visita: '',
    fecha_instalacion: '',
    notas_admin: '',
  };

  esAdmin = computed(() => this.usuario()?.rol === 'admin');

  /** Etiquetas de los estados, para los botones de accion. */
  readonly etiquetas: Record<EstadoPedido, string> = {
    solicitado: 'Solicitado',
    en_revision: 'Pasar a revision',
    aprobado: 'Aprobar',
    agendado: 'Agendar instalacion',
    en_instalacion: 'Iniciar instalacion',
    completado: 'Marcar completado',
    rechazado: 'Rechazar',
    cancelado: 'Cancelar',
  };

  /** Filtros rapidos del encabezado. */
  readonly filtros: { valor: EstadoPedido | null; etiqueta: string }[] = [
    { valor: null, etiqueta: 'Todas' },
    { valor: 'solicitado', etiqueta: 'Nuevas' },
    { valor: 'en_revision', etiqueta: 'En revision' },
    { valor: 'aprobado', etiqueta: 'Aprobadas' },
    { valor: 'agendado', etiqueta: 'Agendadas' },
    { valor: 'en_instalacion', etiqueta: 'Instalando' },
    { valor: 'completado', etiqueta: 'Completadas' },
    { valor: 'rechazado', etiqueta: 'Rechazadas' },
  ];

  /** Cuantas solicitudes estan esperando que alguien las vea. */
  nuevas = computed(
    () => this.pedidos().filter((p) => p.estado === 'solicitado').length,
  );

  /** Suma de lo aprobado y en curso, sin contar rechazos ni cancelaciones. */
  montoActivo = computed(() =>
    this.pedidos()
      .filter((p) => !p.detenido)
      .reduce((suma, p) => suma + p.total, 0),
  );

  async ngOnInit() {
    // Igual que en la vista de pedidos: sin esperar la restauracion, el
    // rol llega vacio y el panel se comporta como si no fuera admin.
    await this.sesion.listo();
    await this.cargar();
  }

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------
  async cargar() {
    if (!this.esAdmin()) {
      return;
    }

    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      await this.repo.listarTodos(this.filtro() ?? undefined);
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  async filtrarPor(estado: EstadoPedido | null) {
    this.filtro.set(estado);
    this.abierto.set(null);
    await this.cargar();
  }

  /** Abre el pedido con sus partidas e historial. */
  async abrir(pedido: Pedido) {
    this.limpiarMensajes();
    this.destino.set(null);
    this.limpiarFormulario();

    this.cargando.set(true);
    try {
      const completo = await this.repo.obtener(pedido.id);
      this.abierto.set(completo);

      // Se precargan las fechas ya fijadas para no tener que
      // reescribirlas al hacer un cambio posterior.
      this.form.fecha_visita = completo.fecha_visita ?? '';
      this.form.fecha_instalacion = completo.fecha_instalacion ?? '';
      this.form.notas_admin = completo.notas_admin ?? '';
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  cerrar() {
    this.abierto.set(null);
    this.destino.set(null);
    this.limpiarMensajes();
  }

  // ------------------------------------------------------------
  //  Gestion del pedido
  // ------------------------------------------------------------

  /** Selecciona la accion; el formulario se adapta a lo que pide. */
  elegirDestino(estado: EstadoPedido) {
    this.limpiarMensajes();
    this.destino.set(this.destino() === estado ? null : estado);
  }

  /** El motivo solo se pide al rechazar. */
  pideMotivo = computed(() => this.destino() === 'rechazado');

  /** La fecha de instalacion es obligatoria para agendar. */
  pideFechaInstalacion = computed(() => this.destino() === 'agendado');

  /** Al aprobar tiene sentido fijar ya la visita tecnica. */
  pideFechaVisita = computed(() => this.destino() === 'aprobado');

  async aplicar() {
    const pedido = this.abierto();
    const destino = this.destino();

    if (!pedido || !destino || this.cargando()) {
      return;
    }

    this.limpiarMensajes();

    // Se validan aqui los dos casos que la API tambien exige, para dar
    // el aviso sin gastar un viaje al servidor.
    if (destino === 'rechazado' && !this.form.motivo_rechazo.trim()) {
      this.mensajeError.set('Escribe el motivo del rechazo: el cliente lo vera.');
      return;
    }
    if (destino === 'agendado' && !this.form.fecha_instalacion) {
      this.mensajeError.set('Fija la fecha de instalacion para poder agendar.');
      return;
    }

    const cambio: CambioEstado = {
      estado: destino,
      revisado_por: this.usuario()?.id,
    };

    if (this.form.comentario.trim()) {
      cambio.comentario = this.form.comentario.trim();
    }
    if (this.form.motivo_rechazo.trim()) {
      cambio.motivo_rechazo = this.form.motivo_rechazo.trim();
    }
    if (this.form.fecha_visita) {
      cambio.fecha_visita = this.form.fecha_visita;
    }
    if (this.form.fecha_instalacion) {
      cambio.fecha_instalacion = this.form.fecha_instalacion;
    }
    if (this.form.notas_admin.trim()) {
      cambio.notas_admin = this.form.notas_admin.trim();
    }

    this.cargando.set(true);
    try {
      const actualizado = await this.repo.cambiarEstado(pedido.id, cambio);

      this.abierto.set(actualizado);
      this.destino.set(null);
      this.form.comentario = '';
      this.form.motivo_rechazo = '';
      this.mensajeOk.set(
        `${pedido.folio} ahora esta en "${actualizado.estado_etiqueta}".`,
      );
      await this.cargar();
    } catch (e) {
      // Si se intento un salto invalido, la API responde 409 con el
      // mensaje explicado y se muestra tal cual.
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Guarda fechas o notas sin mover el estado. */
  async guardarDatos() {
    const pedido = this.abierto();
    if (!pedido || this.cargando()) {
      return;
    }

    this.limpiarMensajes();
    this.cargando.set(true);
    try {
      const actualizado = await this.repo.actualizar(pedido.id, {
        fecha_visita: this.form.fecha_visita || null,
        fecha_instalacion: this.form.fecha_instalacion || null,
        notas_admin: this.form.notas_admin.trim() || null,
      });
      this.abierto.set(actualizado);
      this.mensajeOk.set('Datos del proyecto actualizados.');
      await this.cargar();
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  colorEstado(pedido: Pedido): string {
    return COLOR_ESTADO[pedido.estado] ?? 'gris';
  }

  irAAcceder() {
    this.router.navigateByUrl('/tabs/tab1');
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

  private limpiarFormulario() {
    this.form = {
      comentario: '',
      motivo_rechazo: '',
      fecha_visita: '',
      fecha_instalacion: '',
      notas_admin: '',
    };
  }
}

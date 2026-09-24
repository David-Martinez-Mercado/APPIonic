import { Injectable, inject, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { PedidoRepository } from './pedido.repository';
import { ConexionService } from './conexion.service';
import { ApiError, NuevoPedido, Pedido } from '../models';

/**
 * Solicitudes que no se pudieron enviar por falta de conexion.
 *
 * Sin esto, un cliente que arma su proyecto en una azotea sin senal
 * pierde el trabajo: pulsa "Enviar", falla, y se queda sin nada. Con
 * la cola, la solicitud se guarda en el dispositivo y se manda sola
 * cuando vuelve la conexion.
 *
 * Solo se encolan los fallos de RED (codigo 0). Si el servidor
 * respondio 422 porque falta stock, reintentarlo despues dara el mismo
 * error: eso hay que corregirlo, no reintentarlo.
 */
@Injectable({ providedIn: 'root' })
export class PendientesRepository {
  private storage = inject(StorageService);
  private pedidos = inject(PedidoRepository);
  private conexion = inject(ConexionService);

  private static readonly CLAVE = 'pedidos_pendientes';

  /** Solicitudes en espera de poder enviarse. */
  readonly pendientes = signal<SolicitudPendiente[]>([]);

  readonly hayPendientes = computed(() => this.pendientes().length > 0);

  /** true mientras se esta intentando vaciar la cola. */
  readonly sincronizando = signal(false);

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /** Lee la cola guardada. Se llama al arrancar la aplicacion. */
  async cargar(): Promise<SolicitudPendiente[]> {
    const guardadas = await this.storage.obtener<SolicitudPendiente[]>(
      PendientesRepository.CLAVE,
    );
    const lista = guardadas ?? [];

    this.pendientes.set(lista);
    return lista;
  }

  // ------------------------------------------------------------
  //  CREATE
  // ------------------------------------------------------------

  /** Guarda una solicitud que no se pudo enviar. */
  async encolar(datos: NuevoPedido): Promise<SolicitudPendiente> {
    const solicitud: SolicitudPendiente = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      datos,
      creada_en: new Date().toISOString(),
      intentos: 0,
      ultimo_error: null,
    };

    this.pendientes.update((lista) => [...lista, solicitud]);
    await this.persistir();
    return solicitud;
  }

  // ------------------------------------------------------------
  //  Sincronizacion
  // ------------------------------------------------------------

  /**
   * Intenta enviar todo lo que hay en la cola.
   *
   * Devuelve cuantas salieron y cuantas siguen pendientes, para que la
   * vista pueda dar un mensaje concreto en vez de un "listo" a secas.
   *
   * Si una solicitud falla por red, se deja en la cola y se corta el
   * bucle: si la conexion no esta, las siguientes fallaran igual y
   * solo se gastaria tiempo.
   */
  async sincronizar(): Promise<ResultadoSincronizacion> {
    if (this.sincronizando() || !this.hayPendientes()) {
      return { enviadas: 0, fallidas: 0, folios: [] };
    }

    this.sincronizando.set(true);

    const enviadas: Pedido[] = [];
    const quedan: SolicitudPendiente[] = [];
    let cortado = false;

    try {
      for (const solicitud of this.pendientes()) {
        if (cortado) {
          quedan.push(solicitud);
          continue;
        }

        try {
          const pedido = await this.pedidos.crear(solicitud.datos);
          enviadas.push(pedido);
        } catch (e) {
          const esFalloDeRed = e instanceof ApiError && e.codigo === 0;

          quedan.push({
            ...solicitud,
            intentos: solicitud.intentos + 1,
            ultimo_error: e instanceof ApiError ? e.message : 'Error inesperado.',
          });

          if (esFalloDeRed) {
            // Sigue sin haber conexion: no tiene sentido continuar.
            cortado = true;
          }
        }
      }

      this.pendientes.set(quedan);
      await this.persistir();

      return {
        enviadas: enviadas.length,
        fallidas: quedan.length,
        folios: enviadas.map((p) => p.folio),
      };
    } finally {
      this.sincronizando.set(false);
    }
  }

  /** Comprueba la conexion y, si hay servidor, vacia la cola. */
  async sincronizarSiHayConexion(): Promise<ResultadoSincronizacion> {
    if (!this.hayPendientes()) {
      return { enviadas: 0, fallidas: 0, folios: [] };
    }

    const hayServidor = await this.conexion.comprobar();
    if (!hayServidor) {
      return { enviadas: 0, fallidas: this.pendientes().length, folios: [] };
    }

    return this.sincronizar();
  }

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  /** Descarta una solicitud pendiente. */
  async descartar(id: string): Promise<boolean> {
    const existia = this.pendientes().some((s) => s.id === id);

    if (!existia) {
      return false;
    }

    this.pendientes.update((lista) => lista.filter((s) => s.id !== id));
    await this.persistir();
    return true;
  }

  private async persistir(): Promise<void> {
    await this.storage.guardar(PendientesRepository.CLAVE, this.pendientes());
  }
}

/** Una solicitud esperando a que vuelva la conexion. */
export interface SolicitudPendiente {
  id: string;
  datos: NuevoPedido;
  creada_en: string;
  /** Cuantas veces se ha intentado enviar. */
  intentos: number;
  ultimo_error: string | null;
}

export interface ResultadoSincronizacion {
  enviadas: number;
  fallidas: number;
  folios: string[];
}

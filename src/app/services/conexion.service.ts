import { Injectable, inject, signal, computed } from '@angular/core';
import { Network } from '@capacitor/network';
import type { ConnectionStatus } from '@capacitor/network';
import { ServidorService } from './servidor.service';

/**
 * Estado de la conexion.
 *
 * Distingue dos cosas que suelen confundirse:
 *
 *   - RED: el dispositivo tiene wifi o datos. Lo reporta el sistema
 *     operativo a traves de Capacitor Network.
 *   - SERVIDOR: la API responde. Se comprueba pidiendole algo.
 *
 * La diferencia importa porque los dos fallos NO son el mismo problema
 * y el usuario no puede resolverlos igual: si no hay red, el mensaje
 * util es "revisa tu wifi"; si hay red pero el servidor no responde,
 * es "el servidor esta caido, no es tu telefono".
 *
 * En el navegador, Capacitor Network se apoya en navigator.onLine, que
 * solo sabe si hay interfaz de red levantada: estar conectado a un wifi
 * sin salida a internet se reporta como "en linea". Por eso la
 * comprobacion contra el servidor no sobra.
 */
@Injectable({ providedIn: 'root' })
export class ConexionService {
  private servidor = inject(ServidorService);

  /** Hay red segun el sistema operativo. */
  readonly hayRed = signal(true);

  /** Tipo de conexion: wifi, cellular, none... */
  readonly tipoRed = signal<string>('unknown');

  /**
   * El servidor respondio la ultima vez que se le pidio algo.
   *
   * Arranca en true para no mostrar un aviso de alarma antes de haber
   * intentado nada: se corrige en cuanto ocurre la primera peticion.
   */
  readonly servidorResponde = signal(true);

  /** Momento del ultimo contacto correcto con la API. */
  readonly ultimoContacto = signal<Date | null>(null);

  /**
   * Quienes quieren enterarse de que volvio la conexion.
   *
   * Se usa una lista de funciones en lugar de inyectar aqui los
   * repositorios que necesitan sincronizar: ConexionService es una
   * capa base y no debe conocer a quienes la usan. Si lo hiciera,
   * PendientesRepository dependeria de el y el de PendientesRepository,
   * una dependencia circular que Angular no puede resolver.
   */
  private readonly alRecuperar: (() => void | Promise<void>)[] = [];

  /** true cuando se puede trabajar contra el servidor. */
  readonly enLinea = computed(() => this.hayRed() && this.servidorResponde());

  /**
   * Motivo por el que no se puede trabajar en linea.
   *
   * Se calcula aqui, y no en cada vista, para que todas las pantallas
   * digan lo mismo ante el mismo fallo.
   */
  readonly motivo = computed<MotivoDesconexion>(() => {
    if (!this.hayRed()) {
      return 'sin_red';
    }
    if (!this.servidorResponde()) {
      return 'servidor_caido';
    }
    return 'ninguno';
  });

  /** Mensaje listo para mostrar, acorde al motivo. */
  readonly mensaje = computed(() => MENSAJES[this.motivo()]);

  private iniciado = false;

  /**
   * Empieza a escuchar los cambios de red.
   *
   * Se llama una sola vez al arrancar la aplicacion. El listener del
   * sistema avisa en cuanto el wifi se cae o vuelve, sin que haya que
   * ir preguntando cada pocos segundos.
   */
  async iniciar(): Promise<void> {
    if (this.iniciado) {
      return;
    }
    this.iniciado = true;

    const estado = await Network.getStatus();
    this.aplicar(estado);

    Network.addListener('networkStatusChange', (nuevo) => {
      this.aplicar(nuevo);

      // Al recuperar la red no se da por bueno el servidor: puede
      // seguir caido. Se marca como desconocido y la siguiente
      // peticion lo resolvera.
      if (nuevo.connected) {
        this.servidorResponde.set(true);

        // Volvio la red: se avisa a quien tenga trabajo pendiente.
        // Sin esto, lo que quedo sin enviar espera a que el usuario
        // entre a la pantalla correcta, que puede no ocurrir nunca.
        this.avisarRecuperacion();
      }
    });
  }

  /**
   * Registra algo que hacer cuando vuelva la conexion.
   *
   * Devuelve una funcion para darse de baja, aunque en esta aplicacion
   * los suscriptores viven lo que vive la aplicacion.
   */
  alVolverLaConexion(accion: () => void | Promise<void>): () => void {
    this.alRecuperar.push(accion);

    return () => {
      const i = this.alRecuperar.indexOf(accion);
      if (i >= 0) {
        this.alRecuperar.splice(i, 1);
      }
    };
  }

  /**
   * Ejecuta a los suscriptores.
   *
   * Cada uno se envuelve en su propio catch: si uno falla, los demas
   * deben seguir corriendo igualmente.
   */
  private avisarRecuperacion(): void {
    for (const accion of this.alRecuperar) {
      try {
        const r = accion();
        if (r instanceof Promise) {
          r.catch(() => undefined);
        }
      } catch {
        // Un suscriptor roto no puede impedir que se avise al resto.
      }
    }
  }

  /** Lo llama HttpService cuando una peticion sale bien. */
  registrarExito(): void {
    this.servidorResponde.set(true);
    this.ultimoContacto.set(new Date());
  }

  /**
   * Lo llama HttpService cuando una peticion falla sin respuesta.
   *
   * Solo se marca el servidor como caido ante fallos de transporte
   * (sin respuesta o timeout). Un 404 o un 422 significan que el
   * servidor esta perfectamente vivo y contesto: lo que fallo fue la
   * peticion, no la conexion.
   */
  registrarFalloDeRed(): void {
    this.servidorResponde.set(false);
  }

  /**
   * Comprueba contra el servidor de verdad.
   *
   * Sirve para el boton "Reintentar": en lugar de fiarse del estado
   * guardado, vuelve a preguntar. Usa fetch y no el HttpService para
   * no entrar en un ciclo, y un timeout corto porque aqui solo
   * interesa saber si contesta, no que devuelva datos.
   */
  async comprobar(): Promise<boolean> {
    const estado = await Network.getStatus();
    this.aplicar(estado);

    if (!estado.connected) {
      this.servidorResponde.set(false);
      return false;
    }

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 4000);

    try {
      // Se comprueba contra la direccion que el usuario configuro,
      // no contra la que venia compilada.
      await fetch(this.servidor.pingUrl(), {
        method: 'GET',
        signal: control.signal,
        cache: 'no-store',
      });
      this.registrarExito();
      return true;
    } catch {
      this.servidorResponde.set(false);
      return false;
    } finally {
      clearTimeout(temporizador);
    }
  }

  private aplicar(estado: ConnectionStatus): void {
    this.hayRed.set(estado.connected);
    this.tipoRed.set(estado.connectionType);
  }
}

/** Por que no se puede trabajar en linea. */
export type MotivoDesconexion = 'ninguno' | 'sin_red' | 'servidor_caido';

/**
 * Mensajes para el usuario.
 *
 * Cada uno dice que paso y que puede hacer al respecto. Un "Error de
 * conexion" a secas no le sirve a nadie: no distingue si el problema
 * es su wifi o el servidor.
 */
const MENSAJES: Record<MotivoDesconexion, string> = {
  ninguno: '',
  sin_red:
    'Sin conexion a internet. Revisa tu wifi o tus datos moviles. ' +
    'Puedes seguir navegando el catalogo guardado.',
  servidor_caido:
    'No se pudo contactar al servidor. Tu conexion funciona, pero el ' +
    'servicio no responde. Verifica que Apache este iniciado en XAMPP.',
};

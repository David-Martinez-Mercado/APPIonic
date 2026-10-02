import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { UsuarioRepository } from '../services/usuario.repository';
import { SesionService } from '../services/sesion.service';
import { ServidorService } from '../services/servidor.service';
import { ApiError, Usuario, Credenciales, NuevoUsuario } from '../models';
import { ConexionService } from '../services/conexion.service';
import { ModalErrorComponent } from '../components/modal-error.component';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    FormsModule,
    ModalErrorComponent,
  ],
})
export class Tab1Page implements OnInit {
  private repo = inject(UsuarioRepository);
  private sesion = inject(SesionService);
  private servidor = inject(ServidorService);
  private conexion = inject(ConexionService);

  // Signals y no propiedades sueltas: la app es zoneless y estos valores
  // cambian despues de un await (al restaurar la sesion del dispositivo o al
  // responder la API), momento en el que Angular ya no esta observando. Con
  // una propiedad normal el cambio ocurre pero la vista no se repinta.

  /** false = panel de Log in visible, true = panel de Sign up visible */
  isLogIn = signal(false);
  /** true = estado final con la palomita */
  isActive = signal(false);

  login: Credenciales = { username: '', password: '' };
  signup: NuevoUsuario = { email: '', full_name: '', username: '', password: '' };

  // Se usan signals porque la app es zoneless: axios responde fuera de
  // Angular y sin signal la vista no se volveria a pintar sola.
  cargando = signal(false);
  mensajeError = signal('');
  usuario = signal<Usuario | null>(null);

  // ------------------------------------------------------------
  //  Diagnostico del acceso
  // ------------------------------------------------------------

  /**
   * Resultado del ultimo intento, con el detalle tecnico.
   *
   * Se muestra debajo del campo de contrasena: un "usuario o
   * contrasena incorrectos" no distingue entre credenciales malas y
   * una IP mal configurada, y aqui hace falta saber cual de las dos es.
   */
  diagnostico = signal<DiagnosticoAcceso | null>(null);

  /** Error completo para el modal, cuando el usuario quiere ver mas. */
  errorModal = signal<ApiError | null>(null);

  /** Estado de la red, para el bloque de diagnostico. */
  hayRed = this.conexion.hayRed;
  tipoRed = this.conexion.tipoRed;

  /** A donde se mandara la peticion de acceso. */
  urlDestino = this.servidor.usuariosUrl;

  /**
   * Restaura la sesion guardada al entrar.
   *
   * Es el punto que demuestra la persistencia: si en una ejecucion anterior
   * se inicio sesion, aqui se recupera del dispositivo y la vista aparece
   * directamente en el estado autenticado, sin pedir credenciales de nuevo.
   */
  // ------------------------------------------------------------
  //  Conexion al servidor
  // ------------------------------------------------------------

  /** Direccion configurada, tal como la usan las peticiones. */
  host = this.servidor.host;

  /** Puertos, para mostrarlos en la pantalla. */
  readonly puertoHttp = ServidorService.PUERTO_HTTP;
  readonly puertoMysql = ServidorService.PUERTO_MYSQL;

  /** El panel arranca plegado: solo estorba cuando ya esta configurado. */
  configAbierta = signal(false);

  /** Lo que el usuario escribe, sin aplicar hasta que guarda. */
  hostEditado = '';

  probando = signal(false);
  mensajeServidor = signal('');

  /** null = sin probar; true/false = resultado de la ultima prueba. */
  probado = signal<boolean | null>(null);

  alternarConfig() {
    this.configAbierta.update((v) => !v);

    // Al abrir se copia la direccion actual, para que el campo no
    // aparezca vacio y se vea que se esta editando lo que ya hay.
    if (this.configAbierta()) {
      this.hostEditado = this.host();
      this.mensajeServidor.set('');
    }
  }

  /** Comprueba la direccion escrita sin guardarla todavia. */
  async probarServidor() {
    if (this.probando()) {
      return;
    }

    this.probando.set(true);
    this.mensajeServidor.set('');

    try {
      const r = await this.servidor.probar(this.hostEditado || this.host());
      this.probado.set(r.ok);
      this.mensajeServidor.set(r.mensaje);
      // Queda registrado dentro del JSON del origen de datos, para
      // poder consultarlo despues en la pantalla de origenes.
      await this.servidor.registrarPrueba(r);
    } finally {
      this.probando.set(false);
    }
  }

  /**
   * Guarda la direccion y la prueba.
   *
   * Se guarda aunque la prueba falle: puede que el servidor todavia no
   * este encendido, y obligar a reescribir la IP cada vez seria peor
   * que aceptarla y avisar de que aun no responde.
   */
  async guardarServidor() {
    if (this.probando()) {
      return;
    }

    this.probando.set(true);
    this.mensajeServidor.set('');

    try {
      await this.servidor.guardar(this.hostEditado);

      const r = await this.servidor.probar();
      await this.servidor.registrarPrueba(r);
      this.probado.set(r.ok);
      this.mensajeServidor.set(
        r.ok
          ? `Direccion guardada. ${r.mensaje}`
          : `Direccion guardada, pero ${r.mensaje.charAt(0).toLowerCase()}${r.mensaje.slice(1)}`,
      );
    } catch (e) {
      this.probado.set(false);
      this.mensajeServidor.set(
        e instanceof Error ? e.message : 'No se pudo guardar la direccion.',
      );
    } finally {
      this.probando.set(false);
    }
  }

  async restablecerServidor() {
    const predeterminado = await this.servidor.restablecer();

    this.hostEditado = predeterminado.host;
    this.probado.set(null);
    this.mensajeServidor.set(`Direccion restablecida a ${predeterminado.host}.`);
  }

  async ngOnInit() {
    // La direccion del servidor se lee primero: si se dejo configurada
    // otra IP, el resto de la aplicacion debe usarla desde el arranque.
    await this.servidor.listo();
    this.hostEditado = this.host();

    const guardado = await this.sesion.restaurar();

    if (guardado) {
      this.usuario.set(guardado);
      this.isActive.set(true);
    }
  }

  toggleForm() {
    this.isLogIn.update((v) => !v);
    this.mensajeError.set('');
  }

  /** Llama a la API: login si esta en el panel de Log in, registro si no. */
  async submit() {
    if (this.cargando()) {
      return; // evita doble envio si dan doble clic
    }

    this.mensajeError.set('');
    this.diagnostico.set(null);
    this.cargando.set(true);

    const inicio = Date.now();
    const url = this.urlDestino();

    try {
      const usuario = this.isLogIn() ? await this.registrar() : await this.iniciarSesion();

      // Se guarda en el dispositivo antes de pintar: si la aplicacion se
      // cierra enseguida, la sesion ya quedo persistida.
      await this.sesion.iniciar(usuario);

      this.usuario.set(usuario);
      this.isActive.set(true); // muestra la palomita

      this.diagnostico.set({
        ok: true,
        titulo: `Acceso concedido como ${usuario.full_name}`,
        detalle: `Rol: ${usuario.rol}. Sesion guardada en el dispositivo.`,
        url,
        estado: 200,
        ms: Date.now() - inicio,
        hayRed: this.hayRed(),
        tipoRed: this.tipoRed(),
      });
    } catch (e) {
      // ApiError ya trae el mensaje que mando el PHP
      const esApi = e instanceof ApiError;

      this.mensajeError.set(
        esApi ? (e as ApiError).message : 'Ocurrio un error inesperado.',
      );

      if (esApi) {
        const err = e as ApiError;
        const d = err.diagnostico;

        this.errorModal.set(err);
        this.diagnostico.set({
          ok: false,
          // Codigo 0 = no hubo respuesta: el problema es la conexion o
          // la IP configurada, no las credenciales.
          titulo:
            err.codigo === 0
              ? 'No se pudo contactar al servidor'
              : `El servidor rechazo el acceso (${err.codigo})`,
          detalle: err.message,
          url: d?.url ?? url,
          estado: d?.estado,
          ms: d?.ms ?? Date.now() - inicio,
          hayRed: d?.hayRed ?? this.hayRed(),
          tipoRed: d?.tipoRed ?? this.tipoRed(),
          cabeceras: d?.cabeceras,
          payload: d?.payload,
          intentos: d?.intentos,
        });
      }
    } finally {
      this.cargando.set(false);
    }
  }

  /** Abre el modal con el detalle tecnico del ultimo fallo. */
  verDetalleError() {
    const d = this.diagnostico();
    if (d && !d.ok && this.errorModal()) {
      // El modal ya tiene el error; solo hay que volver a mostrarlo.
      this.errorModal.set(this.errorModal());
    }
  }

  cerrarModal() {
    this.errorModal.set(null);
  }

  private iniciarSesion(): Promise<Usuario> {
    const { username, password } = this.login;

    if (!username.trim() || !password.trim()) {
      return Promise.reject(new ApiError('Escribe tu usuario y contrasena.', 400));
    }
    return this.repo.login({ username: username.trim(), password });
  }

  private registrar(): Promise<Usuario> {
    const { email, full_name, username, password } = this.signup;

    if (!email.trim() || !full_name.trim() || !username.trim() || !password.trim()) {
      return Promise.reject(new ApiError('Llena todos los campos.', 400));
    }
    return this.repo.crear({
      username: username.trim(),
      email: email.trim(),
      full_name: full_name.trim(),
      password,
    });
  }

  /**
   * Cierra la sesion.
   *
   * Borra el usuario del dispositivo, no solo de la pantalla: si solo
   * se limpiara la vista, al reabrir la aplicacion seguiria dentro.
   */
  async cerrarSesion() {
    await this.reset();
    this.diagnostico.set(null);
    this.mensajeError.set('');
  }

  /** Cierra sesion: limpia la vista y borra el dato del dispositivo. */
  async reset() {
    await this.sesion.cerrar();

    this.isActive.set(false);
    this.mensajeError.set('');
    this.usuario.set(null);
    this.login = { username: '', password: '' };
    this.signup = { email: '', full_name: '', username: '', password: '' };
  }
}

/**
 * Lo que se muestra debajo del campo de contrasena tras un intento.
 *
 * Incluye el detalle tecnico porque en una aplicacion que apunta a una
 * IP configurable, "no se pudo acceder" es ambiguo: puede ser la
 * contrasena, la direccion del servidor o la red.
 */
export interface DiagnosticoAcceso {
  ok: boolean;
  titulo: string;
  detalle: string;
  /** URL exacta a la que se mando la peticion. */
  url: string;
  estado?: number;
  ms?: number;
  hayRed?: boolean;
  tipoRed?: string;
  cabeceras?: Record<string, string>;
  payload?: unknown;
  intentos?: number;
}

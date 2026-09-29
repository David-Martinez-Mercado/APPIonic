import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { UsuarioRepository } from '../services/usuario.repository';
import { SesionService } from '../services/sesion.service';
import { ServidorService } from '../services/servidor.service';
import { ApiError, Usuario, Credenciales, NuevoUsuario } from '../models';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, FormsModule],
})
export class Tab1Page implements OnInit {
  private repo = inject(UsuarioRepository);
  private sesion = inject(SesionService);
  private servidor = inject(ServidorService);

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

    this.hostEditado = predeterminado;
    this.probado.set(null);
    this.mensajeServidor.set(`Direccion restablecida a ${predeterminado}.`);
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
    this.cargando.set(true);

    try {
      const usuario = this.isLogIn() ? await this.registrar() : await this.iniciarSesion();

      // Se guarda en el dispositivo antes de pintar: si la aplicacion se
      // cierra enseguida, la sesion ya quedo persistida.
      await this.sesion.iniciar(usuario);

      this.usuario.set(usuario);
      this.isActive.set(true); // muestra la palomita
    } catch (e) {
      // ApiError ya trae el mensaje que mando el PHP
      this.mensajeError.set(
        e instanceof ApiError ? e.message : 'Ocurrio un error inesperado.',
      );
    } finally {
      this.cargando.set(false);
    }
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

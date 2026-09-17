import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { UsuarioRepository } from '../services/usuario.repository';
import { ApiError, Usuario, Credenciales, NuevoUsuario } from '../models';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, FormsModule],
})
export class Tab1Page {
  private repo = inject(UsuarioRepository);

  /** false = panel de Log in visible, true = panel de Sign up visible */
  isLogIn = false;
  /** true = estado final con la palomita */
  isActive = false;

  login: Credenciales = { username: '', password: '' };
  signup: NuevoUsuario = { email: '', full_name: '', username: '', password: '' };

  // Se usan signals porque la app es zoneless: axios responde fuera de
  // Angular y sin signal la vista no se volveria a pintar sola.
  cargando = signal(false);
  mensajeError = signal('');
  usuario = signal<Usuario | null>(null);

  toggleForm() {
    this.isLogIn = !this.isLogIn;
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
      const usuario = this.isLogIn ? await this.registrar() : await this.iniciarSesion();

      this.usuario.set(usuario);
      this.isActive = true; // muestra la palomita
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

  reset() {
    this.isActive = false;
    this.mensajeError.set('');
    this.usuario.set(null);
    this.login = { username: '', password: '' };
    this.signup = { email: '', full_name: '', username: '', password: '' };
  }
}

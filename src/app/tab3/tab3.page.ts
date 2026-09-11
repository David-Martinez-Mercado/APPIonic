import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { ApiService, ApiError, Usuario } from '../services/api.service';

/** Campos del formulario. */
interface FormularioUsuario {
  username: string;
  email: string;
  full_name: string;
  password: string;
  activo: number;
}

const FORM_VACIO: FormularioUsuario = {
  username: '',
  email: '',
  full_name: '',
  password: '',
  activo: 1,
};

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, FormsModule],
})
export class Tab3Page implements OnInit {
  private api = inject(ApiService);

  // Signals: la app es zoneless, axios responde fuera de Angular.
  usuarios = signal<Usuario[]>([]);
  cargando = signal(false);
  mensajeError = signal('');
  mensajeOk = signal('');

  /** null = creando (POST). Un id = editando ese usuario. */
  editandoId = signal<number | null>(null);

  /**
   * PUT reemplaza el registro completo y exige todos los campos.
   * PATCH manda solo lo que cambio. Al crear siempre es POST.
   */
  metodoEdicion = signal<'PATCH' | 'PUT'>('PATCH');

  form: FormularioUsuario = { ...FORM_VACIO };

  /** Copia de como estaba el usuario al empezar a editar, para el PATCH. */
  private original: Usuario | null = null;

  editando = computed(() => this.editandoId() !== null);

  async ngOnInit() {
    await this.cargar();
  }

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------
  async cargar() {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      this.usuarios.set(await this.api.listar());
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  // ------------------------------------------------------------
  //  CREATE / UPDATE  (POST, PUT o PATCH segun el estado)
  // ------------------------------------------------------------
  async guardar() {
    if (this.cargando()) {
      return;
    }

    this.limpiarMensajes();

    const id = this.editandoId();

    // Validacion minima en el cliente; el PHP valida de todos modos
    if (!this.form.username.trim() || !this.form.email.trim() || !this.form.full_name.trim()) {
      this.mensajeError.set('Usuario, correo y nombre completo son obligatorios.');
      return;
    }
    if (id === null && !this.form.password.trim()) {
      this.mensajeError.set('La contrasena es obligatoria al crear un usuario.');
      return;
    }

    this.cargando.set(true);
    try {
      if (id === null) {
        // ---------- POST ----------
        await this.api.crear({
          username: this.form.username.trim(),
          email: this.form.email.trim(),
          full_name: this.form.full_name.trim(),
          password: this.form.password,
        });
        this.mensajeOk.set('Usuario creado correctamente (POST 201).');

      } else if (this.metodoEdicion() === 'PUT') {
        // ---------- PUT: reemplaza todo, exige password ----------
        if (!this.form.password.trim()) {
          this.mensajeError.set('PUT reemplaza el registro completo, por lo que la contrasena es obligatoria. Usa PATCH para no cambiarla.');
          this.cargando.set(false);
          return;
        }
        await this.api.reemplazar(id, {
          username: this.form.username.trim(),
          email: this.form.email.trim(),
          full_name: this.form.full_name.trim(),
          password: this.form.password,
          activo: Number(this.form.activo),
        });
        this.mensajeOk.set('Usuario reemplazado correctamente (PUT 200).');

      } else {
        // ---------- PATCH: solo lo que cambio ----------
        const cambios = this.calcularCambios();

        if (!Object.keys(cambios).length) {
          this.mensajeError.set('No cambiaste ningun campo.');
          this.cargando.set(false);
          return;
        }
        await this.api.actualizar(id, cambios);
        this.mensajeOk.set(
          `Usuario actualizado (PATCH 200). Campos enviados: ${Object.keys(cambios).join(', ')}.`,
        );
      }

      this.cancelar();
      await this.cargar();
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Compara el formulario contra el original: eso es lo que hace util al PATCH. */
  private calcularCambios(): Partial<Usuario & { password: string }> {
    const cambios: Partial<Usuario & { password: string }> = {};
    const o = this.original;

    if (!o) {
      return cambios;
    }
    if (this.form.username.trim() !== o.username) {
      cambios.username = this.form.username.trim();
    }
    if (this.form.email.trim() !== o.email) {
      cambios.email = this.form.email.trim();
    }
    if (this.form.full_name.trim() !== o.full_name) {
      cambios.full_name = this.form.full_name.trim();
    }
    if (Number(this.form.activo) !== o.activo) {
      cambios.activo = Number(this.form.activo);
    }
    // La contrasena solo viaja si el usuario escribio una nueva
    if (this.form.password.trim()) {
      cambios.password = this.form.password;
    }
    return cambios;
  }

  // ------------------------------------------------------------
  //  Preparar edicion
  // ------------------------------------------------------------
  editar(u: Usuario) {
    this.limpiarMensajes();
    this.editandoId.set(u.id);
    this.original = u;
    this.form = {
      username: u.username,
      email: u.email,
      full_name: u.full_name,
      password: '', // vacio = no se cambia
      activo: u.activo,
    };
  }

  cancelar() {
    this.editandoId.set(null);
    this.original = null;
    this.form = { ...FORM_VACIO };
  }

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------
  async eliminar(u: Usuario) {
    if (this.cargando()) {
      return;
    }
    if (!confirm(`Eliminar a "${u.full_name}"? Esta accion no se puede deshacer.`)) {
      return;
    }

    this.limpiarMensajes();
    this.cargando.set(true);
    try {
      await this.api.eliminar(u.id);
      this.mensajeOk.set('Usuario eliminado correctamente (DELETE 200).');

      if (this.editandoId() === u.id) {
        this.cancelar();
      }
      await this.cargar();
    } catch (e) {
      this.mostrarError(e);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Activa/desactiva con PATCH: el caso mas claro de actualizacion parcial. */
  async alternarActivo(u: Usuario) {
    if (this.cargando()) {
      return;
    }
    this.limpiarMensajes();
    this.cargando.set(true);
    try {
      const nuevo = u.activo === 1 ? 0 : 1;
      await this.api.actualizar(u.id, { activo: nuevo });
      this.mensajeOk.set(
        `Usuario ${nuevo === 1 ? 'activado' : 'desactivado'} (PATCH 200, solo se envio "activo").`,
      );
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

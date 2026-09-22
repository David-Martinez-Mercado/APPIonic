import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { NotaRepository } from '../services/nota.repository';
import { Nota, FormularioNota, FORM_NOTA_VACIO } from '../models';

/**
 * CRUD de notas guardadas en el dispositivo.
 *
 * Esta vista es la demostracion de persistencia local de la entrega: no
 * consume la API ni necesita que XAMPP este encendido. Todo lo que se crea,
 * edita o elimina aqui se escribe en el almacenamiento del telefono con
 * Capacitor Preferences y sigue ahi despues de cerrar la aplicacion.
 */
@Component({
  selector: 'app-tab4',
  templateUrl: 'tab4.page.html',
  styleUrls: ['tab4.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, FormsModule, DatePipe],
})
export class Tab4Page implements OnInit {
  private repo = inject(NotaRepository);

  /** La lista vive en el repositorio; la vista solo la lee. */
  notas = this.repo.notas;
  cargado = this.repo.cargado;

  // Signals: la app es zoneless, Preferences resuelve fuera de Angular.
  mensajeOk = signal('');
  mensajeError = signal('');

  /** null = creando. Un id = editando esa nota. */
  editandoId = signal<string | null>(null);

  editando = computed(() => this.editandoId() !== null);

  /** Contador para la cabecera: ayuda a ver de un vistazo que persistio. */
  total = computed(() => this.notas().length);
  favoritas = computed(() => this.notas().filter((n) => n.favorita).length);

  form: FormularioNota = { ...FORM_NOTA_VACIO };

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /** Lee del dispositivo al entrar a la vista. */
  async ngOnInit() {
    await this.repo.cargar();
  }

  // ------------------------------------------------------------
  //  CREATE / UPDATE
  // ------------------------------------------------------------

  async guardar() {
    this.limpiarMensajes();

    const titulo = this.form.titulo.trim();
    const contenido = this.form.contenido.trim();

    if (!titulo) {
      this.mensajeError.set('El titulo es obligatorio.');
      return;
    }

    const id = this.editandoId();

    if (id === null) {
      await this.repo.crear({ titulo, contenido });
      this.mensajeOk.set('Nota creada y guardada en el dispositivo.');
    } else {
      await this.repo.actualizar(id, { titulo, contenido });
      this.mensajeOk.set('Nota actualizada en el dispositivo.');
    }

    this.cancelar();
  }

  editar(n: Nota) {
    this.limpiarMensajes();
    this.editandoId.set(n.id);
    this.form = { titulo: n.titulo, contenido: n.contenido };
  }

  cancelar() {
    this.editandoId.set(null);
    this.form = { ...FORM_NOTA_VACIO };
  }

  /** Edicion parcial: solo viaja el campo favorita. */
  async alternarFavorita(n: Nota) {
    this.limpiarMensajes();
    await this.repo.alternarFavorita(n.id);
  }

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  async eliminar(n: Nota) {
    if (!confirm(`Eliminar la nota "${n.titulo}"?`)) {
      return;
    }

    this.limpiarMensajes();
    await this.repo.eliminar(n.id);
    this.mensajeOk.set('Nota eliminada del dispositivo.');

    if (this.editandoId() === n.id) {
      this.cancelar();
    }
  }

  async vaciar() {
    if (!this.total()) {
      return;
    }
    if (!confirm('Eliminar TODAS las notas guardadas?')) {
      return;
    }

    this.limpiarMensajes();
    await this.repo.vaciar();
    this.mensajeOk.set('Se eliminaron todas las notas.');
    this.cancelar();
  }

  private limpiarMensajes() {
    this.mensajeOk.set('');
    this.mensajeError.set('');
  }
}

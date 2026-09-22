import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { Nota, NuevaNota, CambiosNota } from '../models';

/**
 * Capa de acceso a datos de la entidad Nota.
 *
 * Hace el mismo papel que UsuarioRepository pero contra el almacenamiento
 * del dispositivo en lugar de la API: aqui no hay red, no hay servidor y no
 * hay posibilidad de error 500. Toda operacion escribe en Preferences antes
 * de considerarse terminada, de modo que si la aplicacion se cierra en el
 * instante siguiente el dato ya esta en disco.
 *
 * La lista se expone como signal para que la vista se repinte sola, igual
 * que en el repositorio de usuarios.
 */
@Injectable({ providedIn: 'root' })
export class NotaRepository {
  private storage = inject(StorageService);

  /** Clave bajo la que se guarda el arreglo completo de notas. */
  private static readonly CLAVE = 'notas';

  /** Cache reactiva en memoria; el disco es la fuente de verdad. */
  readonly notas = signal<Nota[]>([]);

  /** true cuando ya se leyo el disco al menos una vez. */
  readonly cargado = signal(false);

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  /** Lee el arreglo guardado. Se llama al entrar a la vista. */
  async cargar(): Promise<Nota[]> {
    const guardadas = await this.storage.obtener<Nota[]>(NotaRepository.CLAVE);
    const notas = guardadas ?? [];

    this.notas.set(notas);
    this.cargado.set(true);
    return notas;
  }

  /** Busca una nota por id dentro de la cache. */
  obtener(id: string): Nota | undefined {
    return this.notas().find((n) => n.id === id);
  }

  // ------------------------------------------------------------
  //  CREATE
  // ------------------------------------------------------------

  /** Agrega una nota al inicio de la lista y persiste. */
  async crear(datos: NuevaNota): Promise<Nota> {
    const ahora = new Date().toISOString();

    const nota: Nota = {
      id: this.generarId(),
      titulo: datos.titulo,
      contenido: datos.contenido,
      favorita: false,
      creado_en: ahora,
      actualizado_en: ahora,
    };

    this.notas.update((lista) => [nota, ...lista]);
    await this.persistir();
    return nota;
  }

  // ------------------------------------------------------------
  //  UPDATE
  // ------------------------------------------------------------

  /** Actualiza solo los campos recibidos y refresca la fecha de cambio. */
  async actualizar(id: string, cambios: CambiosNota): Promise<Nota | null> {
    let actualizada: Nota | null = null;

    this.notas.update((lista) =>
      lista.map((n) => {
        if (n.id !== id) {
          return n;
        }
        actualizada = { ...n, ...cambios, actualizado_en: new Date().toISOString() };
        return actualizada;
      }),
    );

    if (actualizada) {
      await this.persistir();
    }
    return actualizada;
  }

  /** Alterna el campo favorita. Es el caso mas simple de edicion parcial. */
  async alternarFavorita(id: string): Promise<Nota | null> {
    const nota = this.obtener(id);

    if (!nota) {
      return null;
    }
    return this.actualizar(id, { favorita: !nota.favorita });
  }

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  /** Elimina definitivamente una nota (aqui no hay baja logica). */
  async eliminar(id: string): Promise<boolean> {
    const existia = this.notas().some((n) => n.id === id);

    if (!existia) {
      return false;
    }

    this.notas.update((lista) => lista.filter((n) => n.id !== id));
    await this.persistir();
    return true;
  }

  /** Borra todas las notas. Util para demostrar el estado vacio. */
  async vaciar(): Promise<void> {
    this.notas.set([]);
    await this.persistir();
  }

  // ------------------------------------------------------------
  //  Utilidades
  // ------------------------------------------------------------

  /** Vuelca la cache completa al almacenamiento del dispositivo. */
  private async persistir(): Promise<void> {
    await this.storage.guardar(NotaRepository.CLAVE, this.notas());
  }

  /**
   * Genera un id unico sin base de datos: la marca de tiempo da el orden y
   * el sufijo aleatorio evita choques si se crean dos notas el mismo ms.
   */
  private generarId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

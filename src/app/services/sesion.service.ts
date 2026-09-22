import { Injectable, inject, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { Usuario } from '../models';

/**
 * Sesion del usuario que inicio sesion.
 *
 * Antes de esta entrega la sesion solo existia en memoria: al cerrar la
 * aplicacion se perdia y habia que volver a escribir las credenciales. Ahora
 * el usuario autenticado se guarda con Preferences y se restaura al arrancar.
 *
 * Importante: solo se persiste el objeto Usuario que devuelve la API, que
 * NUNCA incluye la contrasena (el PHP la elimina antes de responder). En el
 * dispositivo no queda ninguna credencial guardada.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private storage = inject(StorageService);

  private static readonly CLAVE = 'sesion';

  /** Usuario autenticado, o null si no hay sesion. */
  readonly usuario = signal<Usuario | null>(null);

  /** true cuando ya se intento restaurar la sesion del disco. */
  readonly restaurada = signal(false);

  /**
   * Restauracion en curso.
   *
   * Leer el dispositivo es asincrono, y las vistas se montan en paralelo
   * con la barra de pestanas: sin esto, una vista que pregunta por el rol
   * en su ngOnInit lo encuentra vacio aunque haya sesion guardada, y se
   * comporta como si nadie hubiera iniciado sesion.
   *
   * Se guarda la promesa, no un booleano, para que cualquier vista pueda
   * esperarla sin importar quien llamo primero a restaurar().
   */
  private restauracion: Promise<Usuario | null> | null = null;

  /** Azucar para las plantillas: @if (sesion.autenticado()) */
  readonly autenticado = computed(() => this.usuario() !== null);

  /**
   * Lee la sesion guardada. Se llama al arrancar la aplicacion.
   *
   * Si ya hay una lectura en curso devuelve la misma promesa, en lugar
   * de volver a leer el dispositivo por cada vista que pregunte.
   */
  restaurar(): Promise<Usuario | null> {
    if (this.restauracion) {
      return this.restauracion;
    }

    this.restauracion = this.storage
      .obtener<Usuario>(SesionService.CLAVE)
      .then((guardado) => {
        this.usuario.set(guardado);
        this.restaurada.set(true);
        return guardado;
      });

    return this.restauracion;
  }

  /** Espera a que termine la restauracion inicial. */
  async listo(): Promise<void> {
    await this.restaurar();
  }

  /** Guarda la sesion tras un login o registro correcto. */
  async iniciar(usuario: Usuario): Promise<void> {
    this.usuario.set(usuario);
    this.restaurada.set(true);
    // La restauracion ya no tiene nada que hacer: hay sesion nueva.
    this.restauracion = Promise.resolve(usuario);
    await this.storage.guardar(SesionService.CLAVE, usuario);
  }

  /** Cierra la sesion y borra el dato del dispositivo. */
  async cerrar(): Promise<void> {
    this.usuario.set(null);
    this.restauracion = Promise.resolve(null);
    await this.storage.eliminar(SesionService.CLAVE);
  }
}

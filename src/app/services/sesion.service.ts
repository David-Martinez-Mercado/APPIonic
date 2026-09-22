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

  /** Azucar para las plantillas: @if (sesion.autenticado()) */
  readonly autenticado = computed(() => this.usuario() !== null);

  /** Lee la sesion guardada. Se llama una vez al arrancar la aplicacion. */
  async restaurar(): Promise<Usuario | null> {
    const guardado = await this.storage.obtener<Usuario>(SesionService.CLAVE);

    this.usuario.set(guardado);
    this.restaurada.set(true);
    return guardado;
  }

  /** Guarda la sesion tras un login o registro correcto. */
  async iniciar(usuario: Usuario): Promise<void> {
    this.usuario.set(usuario);
    await this.storage.guardar(SesionService.CLAVE, usuario);
  }

  /** Cierra la sesion y borra el dato del dispositivo. */
  async cerrar(): Promise<void> {
    this.usuario.set(null);
    await this.storage.eliminar(SesionService.CLAVE);
  }
}

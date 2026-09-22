import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Capa de persistencia local.
 *
 * Envuelve Capacitor Preferences para que el resto de la aplicacion no tenga
 * que repetir el JSON.parse / JSON.stringify ni el manejo de valores nulos.
 * Preferences guarda pares clave-valor de texto en el almacenamiento nativo
 * del dispositivo (SharedPreferences en Android, UserDefaults en iOS y
 * localStorage en el navegador), por lo que el dato sobrevive al cierre de
 * la aplicacion.
 *
 * Es el equivalente local de lo que HttpService hace con el servidor: nadie
 * mas conoce el detalle del almacenamiento.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  /** Lee y deserializa. Devuelve null si la clave no existe o esta corrupta. */
  async obtener<T>(clave: string): Promise<T | null> {
    const { value } = await Preferences.get({ key: clave });

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      // Si el valor guardado quedo corrupto se descarta en lugar de tronar:
      // vale mas empezar de cero que dejar la aplicacion sin arrancar.
      await this.eliminar(clave);
      return null;
    }
  }

  /** Serializa y guarda. */
  async guardar<T>(clave: string, valor: T): Promise<void> {
    await Preferences.set({ key: clave, value: JSON.stringify(valor) });
  }

  /** Borra una clave. */
  async eliminar(clave: string): Promise<void> {
    await Preferences.remove({ key: clave });
  }
}

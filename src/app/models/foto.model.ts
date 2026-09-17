/**
 * Entidad Foto.
 *
 * A diferencia de Usuario, esta entidad NO vive en MySQL: se guarda en el
 * dispositivo con Capacitor (Filesystem para el archivo y Preferences para
 * la lista de rutas). Por eso no tiene id numerico ni timestamps.
 *
 * El nombre UserPhoto viene de la plantilla oficial de Ionic y se conserva
 * para no romper la galeria; Foto es el alias que se usa en la documentacion.
 */
export interface UserPhoto {
  /** Nombre del archivo guardado en el sistema de archivos del telefono. */
  filepath: string;
  /** Ruta que entiende el webview para pintar la imagen. */
  webviewPath?: string;
}

/** Alias en espanol de UserPhoto. */
export type Foto = UserPhoto;

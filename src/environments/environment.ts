// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  /**
   * URL base de la API en PHP.
   *
   * localhost solo funciona desde el navegador de la computadora. Desde el
   * emulador de Android hay que usar 10.0.2.2, y desde un celular fisico la
   * IP de la computadora en la red local:
   *
   *   Emulador Android:    'http://10.0.2.2/api/usuarios.php'
   *   Dispositivo fisico:  'http://192.168.1.70/api/usuarios.php'
   */
  apiUrl: 'http://localhost/api/usuarios.php',
};

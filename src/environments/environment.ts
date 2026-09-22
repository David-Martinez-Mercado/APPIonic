// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

/**
 * Host de la API en PHP.
 *
 * localhost solo funciona desde el navegador de la computadora. Desde el
 * emulador de Android hay que usar 10.0.2.2, y desde un celular fisico la
 * IP de la computadora en la red local:
 *
 *   Navegador:           'http://localhost'
 *   Emulador Android:    'http://10.0.2.2'
 *   Dispositivo fisico:  'http://192.168.1.70'
 *
 * Se define una sola vez y las tres URLs se derivan de aqui: antes habia
 * que cambiar la direccion en cada endpoint por separado.
 */
const HOST = 'http://localhost';

export const environment = {
  production: false,

  apiUrl: `${HOST}/api/usuarios.php`,
  productosUrl: `${HOST}/api/productos.php`,
  pedidosUrl: `${HOST}/api/pedidos.php`,
};

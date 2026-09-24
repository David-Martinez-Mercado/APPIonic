/** Host de la API en produccion. Ver las notas de environment.ts. */
const HOST = 'http://localhost';

export const environment = {
  production: true,

  apiUrl: `${HOST}/api/usuarios.php`,
  productosUrl: `${HOST}/api/productos.php`,
  pedidosUrl: `${HOST}/api/pedidos.php`,

  /**
   * Endpoint ligero para comprobar si el servidor responde.
   *
   * Se apunta a productos.php porque no necesita sesion ni parametros;
   * lo unico que interesa es que conteste, no lo que devuelva.
   */
  pingUrl: `${HOST}/api/productos.php`,
};

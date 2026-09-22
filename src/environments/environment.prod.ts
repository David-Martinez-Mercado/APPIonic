/** Host de la API en produccion. Ver las notas de environment.ts. */
const HOST = 'http://localhost';

export const environment = {
  production: true,

  apiUrl: `${HOST}/api/usuarios.php`,
  productosUrl: `${HOST}/api/productos.php`,
  pedidosUrl: `${HOST}/api/pedidos.php`,
};

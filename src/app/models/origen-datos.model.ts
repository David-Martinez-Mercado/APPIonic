/**
 * Origen de datos: a donde apunta la aplicacion para pedir informacion.
 *
 * Se guarda como JSON en el dispositivo. Tener la configuracion como un
 * objeto y no como una cadena suelta permite dos cosas: mostrarla
 * completa en la pantalla de origenes de datos, y agregar campos mas
 * adelante sin romper lo que ya estaba guardado.
 */
export interface OrigenDatos {
  /** Protocolo de la peticion. */
  protocolo: 'http' | 'https';

  /** IP o nombre del equipo donde corre el servidor. */
  host: string;

  /** Puerto de Apache. Por el viajan TODAS las peticiones de la app. */
  puertoHttp: number;

  /**
   * Puerto de MySQL. Es informativo.
   *
   * La aplicacion NUNCA se conecta a este puerto: el PHP habla con la
   * base de datos desde el propio servidor, por localhost. Se guarda
   * para poder mostrarlo en la pantalla de origenes de datos.
   */
  puertoMysql: number;

  /** Nombre de la base de datos, informativo. */
  baseDatos: string;

  /** Carpeta donde viven los .php dentro de htdocs. */
  rutaApi: string;

  /** ISO 8601. Cuando se guardo esta configuracion. */
  actualizado_en: string;

  /** Resultado de la ultima prueba de conexion, si se hizo. */
  ultimaPrueba?: {
    ok: boolean;
    mensaje: string;
    fecha: string;
  };
}

/**
 * Configuracion con la que arranca la aplicacion.
 *
 * Apunta a localhost para que funcione sin configurar nada cuando se
 * prueba en la misma computadora donde corre XAMPP.
 */
export const ORIGEN_PREDETERMINADO: OrigenDatos = {
  protocolo: 'http',
  host: 'localhost',
  puertoHttp: 80,
  puertoMysql: 3306,
  baseDatos: 'app_usuarios',
  rutaApi: '/api',
  actualizado_en: new Date().toISOString(),
};

/** Un endpoint concreto, para listarlos en la pantalla de origenes. */
export interface EndpointApi {
  nombre: string;
  archivo: string;
  descripcion: string;
}

export const ENDPOINTS: EndpointApi[] = [
  {
    nombre: 'Usuarios',
    archivo: 'usuarios.php',
    descripcion: 'Inicio de sesion y gestion de cuentas',
  },
  {
    nombre: 'Productos',
    archivo: 'productos.php',
    descripcion: 'Catalogo de paneles, estructuras, baterias e inversores',
  },
  {
    nombre: 'Pedidos',
    archivo: 'pedidos.php',
    descripcion: 'Solicitudes de proyecto y cambios de estado',
  },
];

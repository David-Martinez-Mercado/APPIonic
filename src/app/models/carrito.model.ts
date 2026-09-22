/**
 * Entidad ItemCarrito.
 *
 * Igual que la Nota de la entrega anterior, esta entidad NO viaja a la
 * API: vive completa en el dispositivo mediante Capacitor Preferences.
 * Es lo que permite que el cliente arme su proyecto, cierre la
 * aplicacion y encuentre su carrito intacto al volver.
 *
 * Guarda una copia del nombre, el precio y la imagen para poder pintar
 * el carrito sin conexion. Ese precio es solo informativo: al enviar la
 * solicitud, el servidor vuelve a tomar el precio del catalogo.
 */
export interface ItemCarrito {
  producto_id: number;
  sku: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  unidad: string;
  categoria: string;
  cantidad: number;
  /** ISO 8601. Sirve para ordenar por lo ultimo agregado. */
  agregado_en: string;
}

/** Totales del carrito, calculados en el cliente para mostrarlos. */
export interface TotalesCarrito {
  piezas: number;
  lineas: number;
  subtotal: number;
  iva: number;
  total: number;
}

/** Debe coincidir con TASA_IVA del PHP. */
export const TASA_IVA = 0.16;

/** Datos que el cliente llena antes de enviar la solicitud. */
export interface DatosSolicitud {
  direccion_instalacion: string;
  ciudad: string;
  telefono_contacto: string;
  notas_cliente: string;
}

export const SOLICITUD_VACIA: DatosSolicitud = {
  direccion_instalacion: '',
  ciudad: '',
  telefono_contacto: '',
  notas_cliente: '',
};

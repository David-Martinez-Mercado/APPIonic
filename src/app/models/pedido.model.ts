/**
 * Entidades del proceso de pedido.
 *
 * Un pedido no es una compra inmediata: es una SOLICITUD de proyecto
 * solar que el cliente envia, un administrador revisa, y que avanza
 * por estados hasta quedar instalada.
 */

/** Estados del ciclo de vida. Coincide con el ENUM de la tabla. */
export type EstadoPedido =
  | 'solicitado'
  | 'en_revision'
  | 'aprobado'
  | 'agendado'
  | 'en_instalacion'
  | 'completado'
  | 'rechazado'
  | 'cancelado';

/**
 * Los seis pasos del avance normal.
 *
 * 'rechazado' y 'cancelado' no estan aqui porque no son avance: son
 * finales donde el proceso se detuvo.
 */
export const FLUJO_PEDIDO: EstadoPedido[] = [
  'solicitado',
  'en_revision',
  'aprobado',
  'agendado',
  'en_instalacion',
  'completado',
];

/** Partida del pedido: que producto y cuantos. */
export interface PedidoDetalle {
  id: number;
  pedido_id: number;
  producto_id: number;
  /** Copiados al crear el pedido: el historico no debe cambiar si el catalogo cambia. */
  nombre_producto: string;
  precio_unitario: number;
  cantidad: number;
  importe: number;
}

/** Entrada de la bitacora: cada cambio de estado deja una. */
export interface PedidoHistorial {
  id: number;
  pedido_id: number;
  estado: EstadoPedido;
  estado_etiqueta: string;
  comentario: string | null;
  usuario_id: number | null;
  creado_en: string;
}

/**
 * Pedido completo.
 *
 * Los campos de progreso (paso, progreso, siguientes...) los calcula
 * el PHP y no la vista, para que la aplicacion movil y cualquier otro
 * consumidor muestren exactamente lo mismo.
 */
export interface Pedido {
  id: number;
  folio: string;
  usuario_id: number;
  estado: EstadoPedido;
  estado_etiqueta: string;

  direccion_instalacion: string;
  ciudad: string | null;
  telefono_contacto: string | null;
  notas_cliente: string | null;

  subtotal: number;
  iva: number;
  total: number;

  fecha_visita: string | null;
  fecha_instalacion: string | null;
  notas_admin: string | null;
  motivo_rechazo: string | null;
  revisado_por: number | null;

  creado_en: string;
  actualizado_en: string;

  // ----- Calculados por la API -----
  /** Posicion dentro del flujo (1..6). 0 si el proceso se detuvo. */
  paso: number;
  pasos_totales: number;
  /** Porcentaje de avance, para la barra de progreso. */
  progreso: number;
  /** true si quedo rechazado o cancelado. */
  detenido: boolean;
  /** Estados a los que se puede pasar desde el actual. */
  siguientes: EstadoPedido[];
  es_final: boolean;

  // ----- Traidos con JOIN -----
  cliente_nombre?: string;
  cliente_email?: string;
  revisor_nombre?: string | null;
  /** Numero de partidas; solo viene en el listado. */
  partidas?: number;

  // ----- Solo al pedir un pedido concreto -----
  detalle?: PedidoDetalle[];
  historial?: PedidoHistorial[];
}

/** Lo que se manda al crear la solicitud desde el carrito. */
export interface NuevoPedido {
  usuario_id: number;
  direccion_instalacion: string;
  ciudad?: string;
  telefono_contacto?: string;
  notas_cliente?: string;
  /** Solo id y cantidad: el precio lo pone el servidor desde el catalogo. */
  items: { producto_id: number; cantidad: number }[];
}

/** Lo que manda el administrador al mover un pedido de estado. */
export interface CambioEstado {
  estado: EstadoPedido;
  comentario?: string;
  /** Obligatorio cuando el estado destino es 'rechazado'. */
  motivo_rechazo?: string;
  /** Obligatoria para pasar a 'agendado'. */
  fecha_instalacion?: string;
  fecha_visita?: string;
  notas_admin?: string;
  revisado_por?: number;
}

/** Colores de cada estado, para las etiquetas de la interfaz. */
export const COLOR_ESTADO: Record<EstadoPedido, string> = {
  solicitado: 'gris',
  en_revision: 'azul',
  aprobado: 'verde',
  agendado: 'verde',
  en_instalacion: 'ambar',
  completado: 'verde-oscuro',
  rechazado: 'rojo',
  cancelado: 'rojo',
};

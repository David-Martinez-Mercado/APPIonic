/**
 * Entidad Producto.
 *
 * Es el catalogo de la tienda: paneles, estructuras, baterias,
 * inversores, el servicio de instalacion y accesorios.
 *
 * Los nombres estan en snake_case a proposito, igual que en Usuario:
 * son los mismos que devuelve la API en PHP.
 */
export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  descripcion: string | null;
  categoria: CategoriaProducto;
  precio: number;
  /** Watts en paneles e inversores; null en el resto. */
  potencia_w: number | null;
  unidad: string;
  imagen_url: string | null;
  stock: number;
  /** 1 = en catalogo, 0 = dado de baja. */
  activo: number;
  creado_en: string;
  actualizado_en: string;
}

/** Debe coincidir con el ENUM de la tabla y con CATEGORIAS del PHP. */
export type CategoriaProducto =
  | 'panel'
  | 'estructura'
  | 'bateria'
  | 'inversor'
  | 'instalacion'
  | 'accesorio';

/** Etiquetas para la interfaz, en el orden en que se muestran. */
export const CATEGORIAS: { valor: CategoriaProducto; etiqueta: string }[] = [
  { valor: 'panel', etiqueta: 'Paneles' },
  { valor: 'estructura', etiqueta: 'Estructuras' },
  { valor: 'bateria', etiqueta: 'Baterias' },
  { valor: 'inversor', etiqueta: 'Inversores' },
  { valor: 'instalacion', etiqueta: 'Instalacion' },
  { valor: 'accesorio', etiqueta: 'Accesorios' },
];

/** Lo que se manda al crear un producto (POST). */
export type NuevoProducto = Pick<
  Producto,
  'sku' | 'nombre' | 'categoria' | 'precio'
> &
  Partial<Pick<Producto, 'descripcion' | 'potencia_w' | 'unidad' | 'imagen_url' | 'stock'>>;

/** Lo que acepta un PATCH: cualquier subconjunto de los campos editables. */
export type CambiosProducto = Partial<
  Omit<Producto, 'id' | 'creado_en' | 'actualizado_en'>
>;

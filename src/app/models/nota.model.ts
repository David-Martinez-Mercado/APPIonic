/**
 * Entidad Nota.
 *
 * A diferencia de Usuario, esta entidad NO viaja a la API: vive completa en
 * el dispositivo mediante Capacitor Preferences. Es la entidad que demuestra
 * el CRUD 100% persistente y offline de esta entrega.
 *
 * El id es un string (timestamp + aleatorio) en lugar de un entero
 * autoincremental porque no hay motor de base de datos que lo genere: lo
 * asigna el propio cliente al crear la nota.
 */
export interface Nota {
  id: string;
  titulo: string;
  contenido: string;
  /** Marca la nota como destacada. Permite probar la edicion parcial. */
  favorita: boolean;
  /** ISO 8601. Se guarda como texto porque JSON no tiene tipo fecha. */
  creado_en: string;
  actualizado_en: string;
}

/** Lo que se necesita para crear una nota: el resto lo calcula el servicio. */
export type NuevaNota = Pick<Nota, 'titulo' | 'contenido'>;

/** Lo que admite una edicion: cualquier subconjunto de los campos editables. */
export type CambiosNota = Partial<Pick<Nota, 'titulo' | 'contenido' | 'favorita'>>;

/** Campos del formulario de la vista. */
export interface FormularioNota {
  titulo: string;
  contenido: string;
}

export const FORM_NOTA_VACIO: FormularioNota = {
  titulo: '',
  contenido: '',
};

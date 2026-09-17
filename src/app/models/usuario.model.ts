/**
 * Entidad Usuario.
 *
 * Los nombres estan en snake_case a proposito: son los mismos que devuelve
 * la API en PHP, asi el JSON se mapea directo sin tener que renombrar campos.
 */
export interface Usuario {
  id: number;
  username: string;
  email: string;
  full_name: string;
  /** 1 = activo, 0 = dado de baja (baja logica, el registro no se borra). */
  activo: number;
  creado_en: string;
  actualizado_en: string;
}

/**
 * Lo que se manda al crear un usuario (POST).
 *
 * Se deriva de Usuario con Pick en lugar de volver a escribir los campos:
 * si manana le agrego una columna a la entidad, este tipo no se queda atras.
 * El password va aparte porque NO es parte de la entidad que devuelve la API
 * (el PHP lo borra del objeto antes de responder).
 */
export type NuevoUsuario = Pick<Usuario, 'username' | 'email' | 'full_name'> & {
  password: string;
};

/**
 * Lo que exige un PUT. Reemplaza el registro completo, por eso pide todos
 * los campos editables incluido el password.
 */
export type UsuarioCompleto = NuevoUsuario & { activo?: number };

/** Lo que acepta un PATCH: cualquier subconjunto de los campos editables. */
export type CambiosUsuario = Partial<UsuarioCompleto>;

/** Credenciales para iniciar sesion. */
export interface Credenciales {
  /** El PHP acepta el username o el email indistintamente. */
  username: string;
  password: string;
}

/**
 * Campos del formulario del CRUD.
 *
 * No es lo mismo que la entidad: aqui el password siempre existe (vacio
 * significa "no cambiar") y no hay id ni timestamps porque no se editan.
 */
export interface FormularioUsuario {
  username: string;
  email: string;
  full_name: string;
  password: string;
  activo: number;
}

export const FORM_VACIO: FormularioUsuario = {
  username: '',
  email: '',
  full_name: '',
  password: '',
  activo: 1,
};

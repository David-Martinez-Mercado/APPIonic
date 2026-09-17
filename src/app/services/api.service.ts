import { Injectable, inject } from '@angular/core';
import { UsuarioRepository } from './usuario.repository';
import { Usuario, NuevoUsuario, UsuarioCompleto, CambiosUsuario } from '../models';

// Se re-exportan para no romper los imports que ya existian en las vistas
// y en las pruebas antes de separar la capa de datos.
export { ApiError } from '../models';
export type { Usuario } from '../models';

/**
 * Fachada de compatibilidad.
 *
 * @deprecated El codigo nuevo debe inyectar UsuarioRepository directamente.
 *
 * Antes esta clase hacia dos cosas a la vez: hablar HTTP con axios y conocer
 * las operaciones de la entidad. Al separarla en HttpService (transporte) y
 * UsuarioRepository (entidad) se conservo este archivo porque las pruebas de
 * tab1 y tab3 lo espian con jasmine.createSpyObj, y borrarlo obligaba a
 * reescribir toda la suite sin ganar nada.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private repo = inject(UsuarioRepository);

  login(username: string, password: string): Promise<Usuario> {
    return this.repo.login({ username, password });
  }

  listar(): Promise<Usuario[]> {
    return this.repo.listar();
  }

  obtener(id: number): Promise<Usuario> {
    return this.repo.obtener(id);
  }

  crear(usuario: NuevoUsuario): Promise<Usuario> {
    return this.repo.crear(usuario);
  }

  reemplazar(id: number, usuario: UsuarioCompleto): Promise<Usuario> {
    return this.repo.reemplazar(id, usuario);
  }

  actualizar(id: number, cambios: CambiosUsuario): Promise<Usuario> {
    return this.repo.actualizar(id, cambios);
  }

  eliminar(id: number): Promise<Usuario> {
    return this.repo.eliminar(id);
  }
}

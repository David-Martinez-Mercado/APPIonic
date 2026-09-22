import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UsuarioRepository } from './usuario.repository';
import { HttpService } from './http.service';
import { ApiError, Usuario } from '../models';
import { environment } from '../../environments/environment';

const ADMIN: Usuario = {
  id: 1,
  username: 'admin',
  email: 'admin@demo.com',
  full_name: 'Administrador',
  rol: 'cliente',
  telefono: null,
  direccion: null,
  activo: 1,
  creado_en: '2026-01-01 00:00:00',
  actualizado_en: '2026-01-01 00:00:00',
};

const ANA: Usuario = {
  id: 2,
  username: 'ana',
  email: 'ana@demo.com',
  full_name: 'Ana Lopez',
  rol: 'cliente',
  telefono: null,
  direccion: null,
  activo: 0,
  creado_en: '2026-01-01 00:00:00',
  actualizado_en: '2026-01-01 00:00:00',
};

describe('UsuarioRepository (capa de acceso a datos)', () => {
  let repo: UsuarioRepository;
  let http: jasmine.SpyObj<HttpService>;
  const url = environment.apiUrl;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpService>('HttpService', [
      'get',
      'post',
      'put',
      'patch',
      'delete',
    ]);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        UsuarioRepository,
        { provide: HttpService, useValue: http },
      ],
    });

    repo = TestBed.inject(UsuarioRepository);
  });

  // ---------------- Verbo y URL de cada operacion ----------------

  it('listar usa GET sobre la URL base', async () => {
    http.get.and.resolveTo([ADMIN, ANA]);

    await repo.listar();

    expect(http.get).toHaveBeenCalledWith(url);
  });

  it('obtener usa GET con el id en la query', async () => {
    http.get.and.resolveTo(ADMIN);

    await repo.obtener(1);

    expect(http.get).toHaveBeenCalledWith(`${url}?id=1`);
  });

  it('crear usa POST con los datos del usuario', async () => {
    http.post.and.resolveTo(ADMIN);
    const nuevo = {
      username: 'admin',
      email: 'admin@demo.com',
      full_name: 'Administrador',
      password: '123456',
    };

    await repo.crear(nuevo);

    expect(http.post).toHaveBeenCalledWith(url, nuevo);
  });

  it('reemplazar usa PUT con el id en la query', async () => {
    http.put.and.resolveTo(ADMIN);
    const completo = {
      username: 'admin',
      email: 'admin@demo.com',
      full_name: 'Administrador',
      password: '123456',
      activo: 1,
    };

    await repo.reemplazar(1, completo);

    expect(http.put).toHaveBeenCalledWith(`${url}?id=1`, completo);
  });

  it('actualizar usa PATCH y manda solo los campos recibidos', async () => {
    http.patch.and.resolveTo({ ...ADMIN, activo: 0 });

    await repo.actualizar(1, { activo: 0 });

    expect(http.patch).toHaveBeenCalledWith(`${url}?id=1`, { activo: 0 });
  });

  it('eliminar usa DELETE con el id en la query', async () => {
    http.delete.and.resolveTo(ADMIN);

    await repo.eliminar(1);

    expect(http.delete).toHaveBeenCalledWith(`${url}?id=1`);
  });

  it('login usa POST sobre ?accion=login', async () => {
    http.post.and.resolveTo(ADMIN);

    await repo.login({ username: 'admin', password: '123456' });

    expect(http.post).toHaveBeenCalledWith(`${url}?accion=login`, {
      username: 'admin',
      password: '123456',
    });
  });

  // ---------------- Cache reactiva ----------------

  it('listar rellena el signal de usuarios', async () => {
    http.get.and.resolveTo([ADMIN, ANA]);

    await repo.listar();

    expect(repo.usuarios().length).toBe(2);
  });

  it('crear agrega el usuario a la cache sin volver a llamar listar', async () => {
    http.get.and.resolveTo([ADMIN]);
    await repo.listar();
    http.get.calls.reset();

    http.post.and.resolveTo(ANA);
    await repo.crear({
      username: 'ana',
      email: 'ana@demo.com',
      full_name: 'Ana Lopez',
      password: '123456',
    });

    expect(repo.usuarios().length).toBe(2);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('eliminar quita el usuario de la cache sin volver a llamar listar', async () => {
    http.get.and.resolveTo([ADMIN, ANA]);
    await repo.listar();
    http.get.calls.reset();

    http.delete.and.resolveTo(ANA);
    await repo.eliminar(2);

    expect(repo.usuarios().map((u) => u.id)).toEqual([1]);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('actualizar sustituye al usuario en la cache respetando el orden', async () => {
    http.get.and.resolveTo([ADMIN, ANA]);
    await repo.listar();

    http.patch.and.resolveTo({ ...ANA, activo: 1 });
    await repo.actualizar(2, { activo: 1 });

    expect(repo.usuarios().map((u) => u.id)).toEqual([1, 2]);
    expect(repo.usuarios()[1].activo).toBe(1);
  });

  it('login no toca la cache', async () => {
    http.post.and.resolveTo(ADMIN);

    await repo.login({ username: 'admin', password: '123456' });

    expect(repo.usuarios()).toEqual([]);
  });

  // ---------------- Errores ----------------

  it('deja pasar el ApiError con su codigo cuando el servidor responde 409', async () => {
    http.post.and.rejectWith(
      new ApiError('El username o el email ya estan registrados.', 409),
    );

    await expectAsync(
      repo.crear({
        username: 'admin',
        email: 'admin@demo.com',
        full_name: 'Administrador',
        password: '123456',
      }),
    ).toBeRejectedWithError(ApiError, 'El username o el email ya estan registrados.');
  });

  it('no altera la cache si la operacion falla', async () => {
    http.get.and.resolveTo([ADMIN]);
    await repo.listar();

    http.delete.and.rejectWith(new ApiError('No existe un usuario con ese id.', 404));
    await expectAsync(repo.eliminar(99)).toBeRejected();

    expect(repo.usuarios().length).toBe(1);
  });
});

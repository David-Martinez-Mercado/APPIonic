import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { Tab3Page } from './tab3.page';
import { UsuarioRepository } from '../services/usuario.repository';
import { ApiError, Usuario } from '../models';

const ADMIN: Usuario = {
  id: 1,
  username: 'admin',
  email: 'admin@demo.com',
  full_name: 'Administrador',
  activo: 1,
  creado_en: '2026-01-01 00:00:00',
  actualizado_en: '2026-01-01 00:00:00',
};

const ANA: Usuario = {
  id: 2,
  username: 'ana',
  email: 'ana@demo.com',
  full_name: 'Ana Lopez',
  activo: 0,
  creado_en: '2026-01-01 00:00:00',
  actualizado_en: '2026-01-01 00:00:00',
};

describe('Tab3Page (CRUD)', () => {
  let component: Tab3Page;
  let fixture: ComponentFixture<Tab3Page>;
  let api: jasmine.SpyObj<UsuarioRepository>;

  const texto = (sel: string) =>
    (fixture.nativeElement.querySelector(sel) as HTMLElement | null)?.textContent?.trim() ?? '';

  const estabilizar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    const cache = signal<Usuario[]>([]);
    api = jasmine.createSpyObj<UsuarioRepository>(
      'UsuarioRepository',
      ['listar', 'crear', 'reemplazar', 'actualizar', 'eliminar'],
      { usuarios: cache },
    );
    api.listar.and.callFake(async () => {
      cache.set([ADMIN, ANA]);
      return [ADMIN, ANA];
    });
    api.crear.and.resolveTo(ADMIN);
    api.reemplazar.and.resolveTo(ADMIN);
    api.actualizar.and.resolveTo(ADMIN);
    api.eliminar.and.resolveTo(ADMIN);

    await TestBed.configureTestingModule({
      imports: [Tab3Page],
      providers: [
        provideZonelessChangeDetection(),
        provideIonicAngular(),
        { provide: UsuarioRepository, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Tab3Page);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await estabilizar();
  });

  // ---------------- READ ----------------

  it('carga la lista al iniciar (GET)', () => {
    expect(api.listar).toHaveBeenCalled();
    expect(component.usuarios().length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.usuario').length).toBe(2);
  });

  it('muestra los datos de cada usuario', () => {
    expect(texto('.usuario')).toContain('Administrador');
    expect(texto('.usuario')).toContain('admin@demo.com');
  });

  it('marca visualmente si el usuario esta activo o inactivo', () => {
    const estados = fixture.nativeElement.querySelectorAll('.estado');
    expect(estados[0].textContent.trim()).toBe('Activo');
    expect(estados[1].textContent.trim()).toBe('Inactivo');
  });

  // ---------------- CREATE ----------------

  it('crea con POST cuando no se esta editando', async () => {
    component.form = {
      username: 'nuevo',
      email: 'nuevo@demo.com',
      full_name: 'Usuario Nuevo',
      password: '123456',
      activo: 1,
    };

    await component.guardar();
    await estabilizar();

    expect(api.crear).toHaveBeenCalledWith({
      username: 'nuevo',
      email: 'nuevo@demo.com',
      full_name: 'Usuario Nuevo',
      password: '123456',
    });
    expect(component.mensajeOk()).toContain('POST 201');
  });

  it('exige contrasena al crear', async () => {
    component.form = {
      username: 'nuevo',
      email: 'nuevo@demo.com',
      full_name: 'Usuario Nuevo',
      password: '',
      activo: 1,
    };

    await component.guardar();

    expect(api.crear).not.toHaveBeenCalled();
    expect(component.mensajeError()).toContain('contrasena es obligatoria');
  });

  it('muestra el error 409 que devuelve la API', async () => {
    api.crear.and.rejectWith(new ApiError('El username o el email ya estan registrados.', 409));
    component.form = {
      username: 'admin',
      email: 'admin@demo.com',
      full_name: 'X',
      password: '123456',
      activo: 1,
    };

    await component.guardar();
    await estabilizar();

    expect(component.mensajeError()).toContain('ya estan registrados');
    expect(component.mensajeError()).toContain('409');
    expect(texto('.aviso.error')).toContain('ya estan registrados');
  });

  // ---------------- PATCH ----------------

  it('PATCH envia SOLO los campos que cambiaron', async () => {
    component.editar(ADMIN);
    component.form.full_name = 'Nombre Cambiado';

    await component.guardar();
    await estabilizar();

    expect(api.actualizar).toHaveBeenCalledWith(1, { full_name: 'Nombre Cambiado' });
    expect(api.reemplazar).not.toHaveBeenCalled();
  });

  it('PATCH no manda la contrasena si se dejo vacia', async () => {
    component.editar(ADMIN);
    component.form.email = 'otro@demo.com';

    await component.guardar();
    await estabilizar();

    const enviado = api.actualizar.calls.mostRecent().args[1];
    expect(enviado).toEqual({ email: 'otro@demo.com' });
    expect(enviado['password']).toBeUndefined();
  });

  it('PATCH si manda la contrasena cuando se escribio una nueva', async () => {
    component.editar(ADMIN);
    component.form.password = 'nueva123';

    await component.guardar();
    await estabilizar();

    expect(api.actualizar).toHaveBeenCalledWith(1, { password: 'nueva123' });
  });

  it('avisa si no se cambio nada en lugar de llamar a la API', async () => {
    component.editar(ADMIN);

    await component.guardar();

    expect(api.actualizar).not.toHaveBeenCalled();
    expect(component.mensajeError()).toContain('No cambiaste ningun campo');
  });

  it('alternarActivo usa PATCH con solo el campo activo', async () => {
    await component.alternarActivo(ADMIN);
    await estabilizar();

    expect(api.actualizar).toHaveBeenCalledWith(1, { activo: 0 });
    expect(component.mensajeOk()).toContain('desactivado');
  });

  // ---------------- PUT ----------------

  it('PUT manda el registro completo', async () => {
    component.editar(ADMIN);
    component.metodoEdicion.set('PUT');
    component.form.full_name = 'Nombre Nuevo';
    component.form.password = 'abcdef';

    await component.guardar();
    await estabilizar();

    expect(api.reemplazar).toHaveBeenCalledWith(1, {
      username: 'admin',
      email: 'admin@demo.com',
      full_name: 'Nombre Nuevo',
      password: 'abcdef',
      activo: 1,
    });
    expect(api.actualizar).not.toHaveBeenCalled();
  });

  it('PUT exige contrasena porque reemplaza todo', async () => {
    component.editar(ADMIN);
    component.metodoEdicion.set('PUT');
    component.form.full_name = 'Otro';

    await component.guardar();

    expect(api.reemplazar).not.toHaveBeenCalled();
    expect(component.mensajeError()).toContain('PUT reemplaza');
  });

  // ---------------- DELETE ----------------

  it('elimina cuando se confirma', async () => {
    spyOn(window, 'confirm').and.returnValue(true);

    await component.eliminar(ANA);
    await estabilizar();

    expect(api.eliminar).toHaveBeenCalledWith(2);
    expect(component.mensajeOk()).toContain('DELETE 200');
  });

  it('no elimina si se cancela la confirmacion', async () => {
    spyOn(window, 'confirm').and.returnValue(false);

    await component.eliminar(ANA);

    expect(api.eliminar).not.toHaveBeenCalled();
  });

  // ---------------- Formulario ----------------

  it('editar llena el formulario y deja la contrasena vacia', () => {
    component.editar(ANA);

    expect(component.editando()).toBeTrue();
    expect(component.editandoId()).toBe(2);
    expect(component.form.username).toBe('ana');
    expect(component.form.activo).toBe(0);
    expect(component.form.password).toBe('');
  });

  it('cancelar limpia el formulario y vuelve a modo creacion', () => {
    component.editar(ANA);
    component.cancelar();

    expect(component.editando()).toBeFalse();
    expect(component.editandoId()).toBeNull();
    expect(component.form.username).toBe('');
  });

  it('avisa cuando el servidor no responde', async () => {
    api.listar.and.rejectWith(
      new ApiError('No se pudo conectar con el servidor. Verifica que Apache este iniciado en XAMPP.', 0),
    );

    await component.cargar();
    await estabilizar();

    expect(component.mensajeError()).toContain('No se pudo conectar');
  });
});

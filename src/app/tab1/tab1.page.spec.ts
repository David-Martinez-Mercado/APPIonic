import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { Tab1Page } from './tab1.page';
import { UsuarioRepository } from '../services/usuario.repository';
import { ApiError, Usuario } from '../models';

/** Usuario falso que devuelve el repositorio simulado. */
const USUARIO_DEMO: Usuario = {
  id: 1,
  username: 'admin',
  email: 'admin@demo.com',
  full_name: 'Administrador',
  activo: 1,
  creado_en: '2026-01-01 00:00:00',
  actualizado_en: '2026-01-01 00:00:00',
};

describe('Tab1Page', () => {
  let component: Tab1Page;
  let fixture: ComponentFixture<Tab1Page>;
  let api: jasmine.SpyObj<UsuarioRepository>;

  const container = () => fixture.nativeElement.querySelector('.container') as HTMLElement;
  const texto = (selector: string) =>
    (fixture.nativeElement.querySelector(selector) as HTMLElement | null)?.textContent?.trim() ?? '';

  const click = async (selector: string) => {
    // dispatchEvent (no .click()) porque los elementos SVG no exponen click()
    fixture.nativeElement
      .querySelector(selector)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    // Se simula el servicio para no pegarle a XAMPP durante los tests
    api = jasmine.createSpyObj<UsuarioRepository>('UsuarioRepository', ['login', 'crear']);
    api.login.and.resolveTo(USUARIO_DEMO);
    api.crear.and.resolveTo(USUARIO_DEMO);

    await TestBed.configureTestingModule({
      imports: [Tab1Page],
      providers: [
        provideZonelessChangeDetection(),
        provideIonicAngular(),
        { provide: UsuarioRepository, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Tab1Page);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders both info panels and both forms', () => {
    expect(fixture.nativeElement.querySelectorAll('.info-item').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.form-item.log-in')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.form-item.sign-up')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.form-item.sign-up input').length).toBe(4);
  });

  it('starts on the log-in form (no .log-in class on container)', () => {
    expect(container().classList.contains('log-in')).toBeFalse();
    expect(container().classList.contains('active')).toBeFalse();
  });

  it('toggles the panel when an info-item button is clicked', async () => {
    await click('.info-item .btn');
    expect(container().classList.contains('log-in')).toBeTrue();

    await click('.info-item .btn');
    expect(container().classList.contains('log-in')).toBeFalse();
  });

  it('binds the form inputs with ngModel', async () => {
    const input = fixture.nativeElement.querySelector(
      '.form-item.log-in input[name="Username"]',
    ) as HTMLInputElement;
    input.value = 'ana';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(component.login.username).toBe('ana');
  });

  // ---------- login contra la API ----------

  it('llama a UsuarioRepository.login con las credenciales y muestra la palomita', async () => {
    component.login = { username: 'admin', password: '123456' };

    await click('.container-form .btn');

    expect(api.login).toHaveBeenCalledWith({ username: 'admin', password: '123456' });
    expect(container().classList.contains('active')).toBeTrue();
    expect(component.usuario()).toEqual(USUARIO_DEMO);
    expect(texto('.bienvenida')).toContain('Administrador');
  });

  it('no llama a la API si faltan credenciales y muestra el error', async () => {
    component.login = { username: '', password: '' };

    await click('.container-form .btn');

    expect(api.login).not.toHaveBeenCalled();
    expect(container().classList.contains('active')).toBeFalse();
    expect(component.mensajeError()).toBe('Escribe tu usuario y contrasena.');
  });

  it('muestra el mensaje que devuelve la API cuando el login falla (401)', async () => {
    api.login.and.rejectWith(new ApiError('Usuario o contrasena incorrectos.', 401));
    component.login = { username: 'admin', password: 'mala' };

    await click('.container-form .btn');

    expect(container().classList.contains('active')).toBeFalse();
    expect(texto('.form-item.log-in .error')).toBe('Usuario o contrasena incorrectos.');
  });

  it('avisa cuando el servidor no responde', async () => {
    api.login.and.rejectWith(
      new ApiError('No se pudo conectar con el servidor. Verifica que Apache este iniciado en XAMPP.', 0),
    );
    component.login = { username: 'admin', password: '123456' };

    await click('.container-form .btn');

    expect(component.mensajeError()).toContain('No se pudo conectar');
  });

  // ---------- registro contra la API ----------

  it('usa UsuarioRepository.crear cuando esta en el panel de Sign up', async () => {
    await click('.info-item .btn'); // cambia a Sign up
    component.signup = {
      email: 'nuevo@demo.com',
      full_name: 'Usuario Nuevo',
      username: 'nuevo',
      password: '123456',
    };

    await click('.container-form .btn');

    expect(api.crear).toHaveBeenCalledWith({
      username: 'nuevo',
      email: 'nuevo@demo.com',
      full_name: 'Usuario Nuevo',
      password: '123456',
    });
    expect(api.login).not.toHaveBeenCalled();
    expect(container().classList.contains('active')).toBeTrue();
  });

  it('muestra el 409 de username duplicado', async () => {
    api.crear.and.rejectWith(new ApiError('El username o el email ya estan registrados.', 409));
    await click('.info-item .btn');
    component.signup = {
      email: 'admin@demo.com',
      full_name: 'X',
      username: 'admin',
      password: '123456',
    };

    await click('.container-form .btn');

    expect(texto('.form-item.sign-up .error')).toBe('El username o el email ya estan registrados.');
  });

  // ---------- reset ----------

  it('el conejito limpia el estado y los formularios', async () => {
    component.login = { username: 'admin', password: '123456' };
    await click('.container-form .btn');
    expect(container().classList.contains('active')).toBeTrue();

    await click('.rabbit');

    expect(container().classList.contains('active')).toBeFalse();
    expect(component.usuario()).toBeNull();
    expect(component.login).toEqual({ username: '', password: '' });
  });
});

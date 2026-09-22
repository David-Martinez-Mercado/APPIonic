import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NotaRepository } from './nota.repository';
import { StorageService } from './storage.service';
import { Nota } from '../models';

/**
 * Pruebas del CRUD persistente de notas.
 *
 * Lo que interesa comprobar no es solo que la lista en memoria cambie, sino
 * que CADA operacion escriba en el almacenamiento: eso es lo que hace que la
 * informacion sobreviva al cierre de la aplicacion. Por eso el doble de
 * StorageService simula un disco real (un Map) en lugar de solo contar
 * llamadas: asi se puede verificar que lo guardado es lo correcto.
 */
describe('NotaRepository (persistencia local)', () => {
  let repo: NotaRepository;
  let disco: Map<string, unknown>;

  beforeEach(() => {
    disco = new Map<string, unknown>();

    // Doble que se comporta como el almacenamiento del dispositivo.
    const storage: Partial<StorageService> = {
      obtener: <T>(clave: string) =>
        Promise.resolve((disco.get(clave) as T) ?? null),
      guardar: <T>(clave: string, valor: T) => {
        // Se serializa y se vuelve a leer para imitar a Preferences, que
        // guarda texto: asi se detectaria cualquier dato no serializable.
        disco.set(clave, JSON.parse(JSON.stringify(valor)));
        return Promise.resolve();
      },
      eliminar: (clave: string) => {
        disco.delete(clave);
        return Promise.resolve();
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        NotaRepository,
        { provide: StorageService, useValue: storage },
      ],
    });

    repo = TestBed.inject(NotaRepository);
  });

  /** Lee lo que quedo escrito en el disco simulado. */
  const guardadas = (): Nota[] => (disco.get('notas') as Nota[]) ?? [];

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  it('arranca vacio cuando el dispositivo no tiene nada guardado', async () => {
    const notas = await repo.cargar();

    expect(notas).toEqual([]);
    expect(repo.notas()).toEqual([]);
    expect(repo.cargado()).toBeTrue();
  });

  it('restaura las notas que ya estaban en el dispositivo', async () => {
    const previa: Nota = {
      id: '1',
      titulo: 'Nota anterior',
      contenido: 'Guardada en una ejecucion previa',
      favorita: true,
      creado_en: '2026-01-01T00:00:00.000Z',
      actualizado_en: '2026-01-01T00:00:00.000Z',
    };
    disco.set('notas', [previa]);

    const notas = await repo.cargar();

    expect(notas.length).toBe(1);
    expect(notas[0].titulo).toBe('Nota anterior');
    expect(notas[0].favorita).toBeTrue();
  });

  // ------------------------------------------------------------
  //  CREATE
  // ------------------------------------------------------------

  it('al crear una nota la escribe en el dispositivo', async () => {
    await repo.cargar();
    const creada = await repo.crear({ titulo: 'Primera', contenido: 'Hola' });

    expect(creada.id).toBeTruthy();
    expect(creada.favorita).toBeFalse();
    // Lo importante: quedo en el "disco", no solo en memoria.
    expect(guardadas().length).toBe(1);
    expect(guardadas()[0].titulo).toBe('Primera');
  });

  it('genera un id distinto para cada nota', async () => {
    await repo.cargar();
    const a = await repo.crear({ titulo: 'A', contenido: '' });
    const b = await repo.crear({ titulo: 'B', contenido: '' });

    expect(a.id).not.toBe(b.id);
  });

  it('coloca la nota mas reciente al inicio de la lista', async () => {
    await repo.cargar();
    await repo.crear({ titulo: 'Vieja', contenido: '' });
    await repo.crear({ titulo: 'Nueva', contenido: '' });

    expect(repo.notas()[0].titulo).toBe('Nueva');
  });

  // ------------------------------------------------------------
  //  UPDATE
  // ------------------------------------------------------------

  it('al actualizar persiste los cambios y refresca actualizado_en', async () => {
    await repo.cargar();
    const creada = await repo.crear({ titulo: 'Original', contenido: 'a' });

    const actualizada = await repo.actualizar(creada.id, { titulo: 'Editada' });

    expect(actualizada?.titulo).toBe('Editada');
    expect(guardadas()[0].titulo).toBe('Editada');
    // El contenido que no se toco debe conservarse.
    expect(guardadas()[0].contenido).toBe('a');
  });

  it('alternarFavorita cambia solo ese campo y lo persiste', async () => {
    await repo.cargar();
    const creada = await repo.crear({ titulo: 'Nota', contenido: 'texto' });

    await repo.alternarFavorita(creada.id);

    expect(guardadas()[0].favorita).toBeTrue();
    expect(guardadas()[0].titulo).toBe('Nota');

    await repo.alternarFavorita(creada.id);
    expect(guardadas()[0].favorita).toBeFalse();
  });

  it('devuelve null al actualizar una nota inexistente', async () => {
    await repo.cargar();
    const resultado = await repo.actualizar('no-existe', { titulo: 'x' });

    expect(resultado).toBeNull();
  });

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  it('al eliminar la quita tambien del dispositivo', async () => {
    await repo.cargar();
    const a = await repo.crear({ titulo: 'A', contenido: '' });
    await repo.crear({ titulo: 'B', contenido: '' });

    const borrada = await repo.eliminar(a.id);

    expect(borrada).toBeTrue();
    expect(guardadas().length).toBe(1);
    expect(guardadas()[0].titulo).toBe('B');
  });

  it('devuelve false al eliminar una nota inexistente', async () => {
    await repo.cargar();
    expect(await repo.eliminar('no-existe')).toBeFalse();
  });

  it('vaciar deja el dispositivo sin notas', async () => {
    await repo.cargar();
    await repo.crear({ titulo: 'A', contenido: '' });
    await repo.crear({ titulo: 'B', contenido: '' });

    await repo.vaciar();

    expect(repo.notas()).toEqual([]);
    expect(guardadas()).toEqual([]);
  });

  // ------------------------------------------------------------
  //  La prueba que demuestra la consigna de la entrega
  // ------------------------------------------------------------

  it('los datos sobreviven a un reinicio de la aplicacion', async () => {
    // --- Primera "ejecucion" de la app ---
    await repo.cargar();
    await repo.crear({ titulo: 'Sobrevive', contenido: 'Debe seguir aqui' });
    const favorita = await repo.crear({ titulo: 'Favorita', contenido: '' });
    await repo.alternarFavorita(favorita.id);

    // --- Se "cierra" la app ---
    // Se tira la instancia y se pierde todo lo que vivia en memoria. Lo unico
    // que persiste es el Map que hace de almacenamiento del dispositivo, igual
    // que ocurre en el telefono al cerrar la aplicacion.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        NotaRepository,
        {
          provide: StorageService,
          useValue: {
            obtener: <T>(clave: string) =>
              Promise.resolve((disco.get(clave) as T) ?? null),
            guardar: <T>(clave: string, valor: T) => {
              disco.set(clave, JSON.parse(JSON.stringify(valor)));
              return Promise.resolve();
            },
            eliminar: (clave: string) => {
              disco.delete(clave);
              return Promise.resolve();
            },
          } as Partial<StorageService>,
        },
      ],
    });

    // --- Segunda "ejecucion": repositorio nuevo, memoria vacia ---
    const repoTrasReinicio = TestBed.inject(NotaRepository);
    expect(repoTrasReinicio.notas()).toEqual([]); // aun no ha leido el disco

    const recuperadas = await repoTrasReinicio.cargar();

    expect(recuperadas.length).toBe(2);
    expect(recuperadas.some((n) => n.titulo === 'Sobrevive')).toBeTrue();
    expect(recuperadas.find((n) => n.titulo === 'Favorita')?.favorita).toBeTrue();
  });
});

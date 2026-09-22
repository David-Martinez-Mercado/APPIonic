import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CarritoRepository } from './carrito.repository';
import { StorageService } from './storage.service';
import { ItemCarrito, Producto } from '../models';

/**
 * Pruebas del carrito persistente.
 *
 * Lo que interesa comprobar no es solo que la lista en memoria cambie,
 * sino que CADA operacion escriba en el almacenamiento: eso es lo que
 * hace que el carrito sobreviva al cierre de la aplicacion. Por eso el
 * doble de StorageService simula un disco real (un Map) en lugar de
 * solo contar llamadas.
 */

const PANEL: Producto = {
  id: 1,
  sku: 'PAN-550M',
  nombre: 'Panel monocristalino 550 W',
  descripcion: 'Panel de prueba',
  categoria: 'panel',
  precio: 4850,
  potencia_w: 550,
  unidad: 'pieza',
  imagen_url: null,
  stock: 10,
  activo: 1,
  creado_en: '2026-01-01 00:00:00',
  actualizado_en: '2026-01-01 00:00:00',
};

const BATERIA: Producto = {
  ...PANEL,
  id: 2,
  sku: 'BAT-LIT5K',
  nombre: 'Bateria de litio 5 kWh',
  categoria: 'bateria',
  precio: 32500,
  potencia_w: null,
  stock: 2,
};

describe('CarritoRepository (persistencia local)', () => {
  let repo: CarritoRepository;
  let disco: Map<string, unknown>;

  /** Doble que se comporta como el almacenamiento del dispositivo. */
  const dobleStorage = (): Partial<StorageService> => ({
    obtener: <T>(clave: string) => Promise.resolve((disco.get(clave) as T) ?? null),
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
  });

  beforeEach(() => {
    disco = new Map<string, unknown>();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CarritoRepository,
        { provide: StorageService, useValue: dobleStorage() },
      ],
    });

    repo = TestBed.inject(CarritoRepository);
  });

  /** Lo que quedo escrito en el disco simulado. */
  const guardado = (): ItemCarrito[] => (disco.get('carrito') as ItemCarrito[]) ?? [];

  // ------------------------------------------------------------
  //  READ
  // ------------------------------------------------------------

  it('arranca vacio cuando el dispositivo no tiene nada guardado', async () => {
    const items = await repo.cargar();

    expect(items).toEqual([]);
    expect(repo.vacio()).toBeTrue();
    expect(repo.cargado()).toBeTrue();
  });

  // ------------------------------------------------------------
  //  CREATE
  // ------------------------------------------------------------

  it('al agregar un producto lo escribe en el dispositivo', async () => {
    await repo.cargar();
    await repo.agregar(PANEL);

    expect(guardado().length).toBe(1);
    expect(guardado()[0].nombre).toBe(PANEL.nombre);
    expect(guardado()[0].cantidad).toBe(1);
  });

  it('agregar dos veces el mismo producto suma la cantidad, no duplica la linea', async () => {
    await repo.cargar();
    await repo.agregar(PANEL);
    await repo.agregar(PANEL, 3);

    expect(repo.items().length).toBe(1);
    expect(guardado()[0].cantidad).toBe(4);
  });

  it('no deja agregar mas unidades de las que hay en existencia', async () => {
    await repo.cargar();
    await repo.agregar(BATERIA, 2); // stock = 2

    await expectAsync(repo.agregar(BATERIA)).toBeRejectedWithError(/Solo hay 2/);
    // El carrito no debe quedar alterado por el intento fallido.
    expect(guardado()[0].cantidad).toBe(2);
  });

  // ------------------------------------------------------------
  //  UPDATE
  // ------------------------------------------------------------

  it('incrementar y decrementar persisten la nueva cantidad', async () => {
    await repo.cargar();
    await repo.agregar(PANEL);

    await repo.incrementar(PANEL.id);
    expect(guardado()[0].cantidad).toBe(2);

    await repo.decrementar(PANEL.id);
    expect(guardado()[0].cantidad).toBe(1);
  });

  it('bajar la cantidad a cero elimina la linea', async () => {
    await repo.cargar();
    await repo.agregar(PANEL);

    await repo.decrementar(PANEL.id);

    expect(repo.vacio()).toBeTrue();
    expect(guardado()).toEqual([]);
  });

  // ------------------------------------------------------------
  //  DELETE
  // ------------------------------------------------------------

  it('al eliminar lo quita tambien del dispositivo', async () => {
    await repo.cargar();
    await repo.agregar(PANEL);
    await repo.agregar(BATERIA);

    expect(await repo.eliminar(PANEL.id)).toBeTrue();
    expect(guardado().length).toBe(1);
    expect(guardado()[0].sku).toBe(BATERIA.sku);
  });

  it('vaciar deja el dispositivo sin lineas', async () => {
    await repo.cargar();
    await repo.agregar(PANEL);
    await repo.agregar(BATERIA);

    await repo.vaciar();

    expect(repo.vacio()).toBeTrue();
    expect(guardado()).toEqual([]);
  });

  // ------------------------------------------------------------
  //  Totales
  // ------------------------------------------------------------

  it('calcula subtotal, IVA y total', async () => {
    await repo.cargar();
    await repo.agregar(PANEL, 2); // 2 x 4850 = 9700

    const t = repo.totales();

    expect(t.piezas).toBe(2);
    expect(t.lineas).toBe(1);
    expect(t.subtotal).toBe(9700);
    expect(t.iva).toBeCloseTo(1552, 2);   // 16%
    expect(t.total).toBeCloseTo(11252, 2);
  });

  it('solo manda id y cantidad a la API, nunca el precio', async () => {
    await repo.cargar();
    await repo.agregar(PANEL, 2);

    const items = repo.aItemsPedido();

    // El precio lo pone el servidor desde el catalogo: si viajara desde
    // el cliente, cualquiera podria pedir paneles a un peso.
    expect(items).toEqual([{ producto_id: PANEL.id, cantidad: 2 }]);
  });

  // ------------------------------------------------------------
  //  La prueba que demuestra la persistencia
  // ------------------------------------------------------------

  it('el carrito sobrevive a un reinicio de la aplicacion', async () => {
    // --- Primera "ejecucion" ---
    await repo.cargar();
    await repo.agregar(PANEL, 3);
    await repo.agregar(BATERIA);

    // --- Se "cierra" la app: se pierde todo lo que vivia en memoria.
    //     Lo unico que persiste es el Map que hace de disco. ---
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CarritoRepository,
        { provide: StorageService, useValue: dobleStorage() },
      ],
    });

    // --- Segunda "ejecucion": repositorio nuevo, memoria vacia ---
    const repoTrasReinicio = TestBed.inject(CarritoRepository);
    expect(repoTrasReinicio.items()).toEqual([]); // aun no lee el disco

    const recuperado = await repoTrasReinicio.cargar();

    expect(recuperado.length).toBe(2);
    expect(recuperado.find((i) => i.sku === PANEL.sku)?.cantidad).toBe(3);
    expect(repoTrasReinicio.totales().piezas).toBe(4);
  });
});

import {
  Component,
  computed,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DecimalPipe, CurrencyPipe } from '@angular/common';
import { GraficaSolarComponent } from './grafica-solar.component';
import {
  ItemCarrito,
  Simulacion,
  simular,
  PRECIO_KWH,
  CONSUMO_MENSUAL_DEFECTO,
  FACTOR_RENDIMIENTO,
} from '../models';

/**
 * Simulador de generacion y ahorro del proyecto que se esta armando.
 *
 * Responde la pregunta que de verdad decide la compra: "esto me va a
 * quitar el recibo de luz?". Hasta ahora el carrito contestaba cuanto
 * cuesta el sistema, pero no cuanto genera.
 *
 * Es interactivo porque el dato que falta lo tiene el cliente, no la
 * aplicacion: su consumo mensual. Al moverlo, la cobertura, el ahorro
 * y la grafica se recalculan en el momento.
 *
 * Todo el calculo es local, con la potencia que ya trae cada linea del
 * carrito, asi que funciona igual sin conexion.
 */
@Component({
  selector: 'app-simulador-solar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, CurrencyPipe, GraficaSolarComponent],
  template: `
    <section class="simulador">
      <h3>
        Tu sistema en numeros
        <span class="insignia">estimado</span>
      </h3>

      @if (!potenciaW()) {
        <!-- Sin paneles no hay nada que simular: se dice que falta en
             vez de dibujar una grafica plana en cero. -->
        <p class="vacio">
          Agrega paneles a tu proyecto para ver cuanta energia generaria
          y cuanto ahorrarias al ano.
        </p>
      } @else {
        <!-- Tarjetas de resultado. El valor cambia con una transicion
             para que se note que el numero se recalculo. -->
        <div class="tarjetas">
          <div class="dato">
            <span class="etiqueta">Potencia</span>
            <strong class="valor">{{ kwPico() | number: '1.1-2' }} kWp</strong>
            <span class="pie">{{ paneles() }} panel(es)</span>
          </div>

          <div class="dato">
            <span class="etiqueta">Genera al ano</span>
            <strong class="valor">
              {{ simulacion().generacionAnual | number: '1.0-0' }} kWh
            </strong>
            <span class="pie">con {{ rendimiento() }} % de rendimiento</span>
          </div>

          <div class="dato resaltado">
            <span class="etiqueta">Ahorro anual</span>
            <strong class="valor">
              {{ simulacion().ahorroAnual | currency: 'MXN':'symbol-narrow':'1.0-0' }}
            </strong>
            <span class="pie">a {{ precioKwh }} $/kWh</span>
          </div>

          <div class="dato">
            <span class="etiqueta">Se paga en</span>
            <strong class="valor">
              @if (simulacion().retornoAnios !== null) {
                {{ simulacion().retornoAnios | number: '1.1-1' }} anos
              } @else {
                —
              }
            </strong>
            <span class="pie">
              sobre {{ inversion() | currency: 'MXN':'symbol-narrow':'1.0-0' }}
              @if (faltaSistema()) { del carrito }
            </span>
          </div>
        </div>

        <!-- Cobertura: la barra es la lectura rapida, el porcentaje el
             dato exacto. -->
        <div class="cobertura">
          <div class="encabezado-cobertura">
            <span>Cubre tu consumo</span>
            <strong [class.completa]="simulacion().cobertura >= 100">
              {{ simulacion().cobertura }} %
            </strong>
          </div>
          <div
            class="barra-cobertura"
            role="progressbar"
            [attr.aria-valuenow]="simulacion().cobertura"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <!-- El ancho se topa en 100 para que la barra no se salga
                 de su caja cuando el sistema genera de mas. -->
            <span
              class="relleno"
              [class.completa]="simulacion().cobertura >= 100"
              [style.width.%]="anchoCobertura()"
            ></span>
          </div>
          <p class="nota-cobertura">{{ veredicto() }}</p>
        </div>

        <!-- El unico dato que la aplicacion no puede saber. -->
        <div class="control">
          <label for="consumo">
            Tu consumo mensual
            <strong>{{ consumo() | number: '1.0-0' }} kWh</strong>
          </label>
          <input
            id="consumo"
            type="range"
            min="100"
            max="1200"
            step="25"
            [value]="consumo()"
            (input)="cambiarConsumo($event)"
          />
          <div class="limites">
            <span>100</span>
            <span>1200 kWh</span>
          </div>
          <p class="ayuda">
            Viene en tu recibo de CFE. Si no lo tienes a mano, deja el valor
            de una casa promedio.
          </p>
        </div>

        <app-grafica-solar [meses]="simulacion().meses" />

        @if (faltaSistema()) {
          <p class="incompleto">
            El retorno esta calculado solo sobre lo que llevas en el carrito.
            Un sistema completo necesita tambien
            {{ faltantes().join(', ') }}, asi que el tiempo real de
            recuperacion sera mayor.
          </p>
        }

        @if (respaldoKwh()) {
          <p class="respaldo">
            Con tus baterias, el sistema guarda
            <strong>{{ respaldoKwh() | number: '1.1-1' }} kWh</strong>
            para seguir dando luz cuando no hay sol.
          </p>
        }

        <p class="descargo">
          Calculo informativo con {{ horasPromedio() | number: '1.1-1' }} horas
          solares promedio en Durango. La generacion real depende de la
          orientacion del techo, la sombra y el clima del ano. El asesor
          confirma las cifras en la visita tecnica.
        </p>
      }
    </section>
  `,
  styles: [
    `
      .simulador {
        margin: 0;
      }

      h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0 0 0.9rem;
        font-size: 1.05rem;
        color: #455a64;
      }

      .insignia {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 0.15rem 0.45rem;
        border-radius: 3px;
        background: rgba(224, 138, 30, 0.15);
        color: #b06d12;
        font-weight: 600;
      }

      .vacio {
        margin: 0;
        font-size: 0.85rem;
        opacity: 0.75;
        color: #455a64;
      }

      .tarjetas {
        display: grid;
        /* auto-fit con minmax: en un telefono caben una o dos por
           fila, en una tableta las cuatro, sin media queries. */
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 0.6rem;
        margin-bottom: 1rem;
      }

      .dato {
        padding: 0.7rem 0.8rem;
        border-radius: 6px;
        background: rgba(69, 90, 100, 0.05);
        border: 1px solid rgba(69, 90, 100, 0.1);
      }

      .dato.resaltado {
        background: rgba(46, 125, 50, 0.08);
        border-color: rgba(46, 125, 50, 0.25);
      }

      .etiqueta {
        display: block;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.65;
        color: #455a64;
      }

      .valor {
        display: block;
        font-size: 1.15rem;
        margin: 0.2rem 0 0.1rem;
        color: #455a64;
        /* El numero cambia al mover el control: la transicion avisa
           que se recalculo en vez de que salte de golpe. */
        transition: color 180ms ease;
      }

      .dato.resaltado .valor {
        color: #2e7d32;
      }

      .pie {
        display: block;
        font-size: 0.68rem;
        opacity: 0.6;
        color: #455a64;
      }

      .cobertura {
        margin-bottom: 1rem;
      }

      .encabezado-cobertura {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 0.85rem;
        color: #455a64;
        margin-bottom: 0.35rem;
      }

      .encabezado-cobertura strong {
        font-size: 1rem;
      }

      .encabezado-cobertura strong.completa {
        color: #2e7d32;
      }

      .barra-cobertura {
        height: 10px;
        border-radius: 5px;
        background: rgba(69, 90, 100, 0.12);
        overflow: hidden;
      }

      .relleno {
        display: block;
        height: 100%;
        border-radius: 5px;
        background: linear-gradient(90deg, #f0a93c, #e08a1e);
        transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .relleno.completa {
        background: linear-gradient(90deg, #4caf50, #2e7d32);
      }

      .nota-cobertura {
        margin: 0.4rem 0 0;
        font-size: 0.78rem;
        opacity: 0.8;
        color: #455a64;
      }

      .control {
        padding: 0.8rem;
        border-radius: 6px;
        background: rgba(69, 90, 100, 0.04);
        margin-bottom: 1.1rem;
      }

      .control label {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 0.82rem;
        color: #455a64;
        margin-bottom: 0.5rem;
      }

      .control label strong {
        font-size: 0.95rem;
        color: #e08a1e;
      }

      input[type='range'] {
        width: 100%;
        /* 44 px de alto real para el dedo, aunque la via se vea fina. */
        height: 44px;
        margin: 0;
        background: transparent;
        -webkit-appearance: none;
        appearance: none;
        cursor: pointer;
      }

      input[type='range']::-webkit-slider-runnable-track {
        height: 5px;
        border-radius: 3px;
        background: rgba(69, 90, 100, 0.2);
      }

      input[type='range']::-moz-range-track {
        height: 5px;
        border-radius: 3px;
        background: rgba(69, 90, 100, 0.2);
      }

      input[type='range']::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 22px;
        height: 22px;
        margin-top: -8.5px;
        border-radius: 50%;
        background: #e08a1e;
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(69, 90, 100, 0.45);
      }

      input[type='range']::-moz-range-thumb {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #e08a1e;
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(69, 90, 100, 0.45);
      }

      input[type='range']:focus-visible {
        outline: 2px solid #455a64;
        outline-offset: 2px;
      }

      .limites {
        display: flex;
        justify-content: space-between;
        font-size: 0.68rem;
        opacity: 0.55;
        color: #455a64;
      }

      .ayuda {
        margin: 0.4rem 0 0;
        font-size: 0.72rem;
        opacity: 0.7;
        color: #455a64;
      }

      .respaldo {
        margin: 0.9rem 0 0;
        padding: 0.6rem 0.8rem;
        border-radius: 6px;
        background: rgba(224, 138, 30, 0.08);
        border-left: 3px solid #e08a1e;
        font-size: 0.8rem;
        color: #455a64;
      }

      .incompleto {
        margin: 0.9rem 0 0;
        padding: 0.6rem 0.8rem;
        border-radius: 6px;
        background: rgba(192, 57, 43, 0.07);
        border-left: 3px solid #c0392b;
        font-size: 0.8rem;
        line-height: 1.5;
        color: #455a64;
      }

      .descargo {
        margin: 0.9rem 0 0;
        font-size: 0.7rem;
        line-height: 1.5;
        opacity: 0.65;
        color: #455a64;
      }
    `,
  ],
})
export class SimuladorSolarComponent {
  /** Lineas del carrito. De aqui sale la potencia instalada. */
  items = input.required<ItemCarrito[]>();

  /** Lo que cuesta el proyecto, para calcular el retorno. */
  inversion = input.required<number>();

  readonly precioKwh = PRECIO_KWH;

  /** Consumo que el cliente ajusta con el control. */
  readonly consumo = signal(CONSUMO_MENSUAL_DEFECTO);

  /** Potencia instalada en watts: solo los paneles generan. */
  readonly potenciaW = computed(() =>
    this.items()
      .filter((i) => i.categoria === 'panel')
      .reduce((suma, i) => suma + (i.potencia_w ?? 0) * i.cantidad, 0),
  );

  readonly paneles = computed(() =>
    this.items()
      .filter((i) => i.categoria === 'panel')
      .reduce((suma, i) => suma + i.cantidad, 0),
  );

  /**
   * Respaldo de las baterias, en kWh.
   *
   * En el catalogo la capacidad de una bateria viaja en potencia_w
   * como Wh, que es como la etiquetan los fabricantes.
   */
  readonly respaldoKwh = computed(
    () =>
      this.items()
        .filter((i) => i.categoria === 'bateria')
        .reduce((suma, i) => suma + (i.potencia_w ?? 0) * i.cantidad, 0) / 1000,
  );

  readonly kwPico = computed(() => this.potenciaW() / 1000);

  readonly rendimiento = computed(() => Math.round(FACTOR_RENDIMIENTO * 100));

  readonly simulacion = computed<Simulacion>(() =>
    simular(
      this.potenciaW(),
      this.consumo(),
      this.inversion(),
      this.paneles(),
      this.respaldoKwh(),
    ),
  );

  /** Ancho de la barra, topado en 100 para no desbordar la caja. */
  readonly anchoCobertura = computed(() =>
    Math.min(100, this.simulacion().cobertura),
  );

  readonly horasPromedio = computed(() => {
    const ms = this.simulacion().meses;
    if (!ms.length) {
      return 0;
    }
    return ms.reduce((s, m) => s + m.horasSol, 0) / ms.length;
  });

  /**
   * Lectura en una frase del porcentaje de cobertura.
   *
   * Un numero suelto no dice que hacer. Sobredimensionar tambien se
   * avisa: pagar paneles que generan de mas no se recupera, porque el
   * excedente se paga a tarifa mucho menor.
   */
  readonly veredicto = computed(() => {
    const c = this.simulacion().cobertura;

    if (c >= 120) {
      return (
        'Tu sistema genera bastante mas de lo que consumes. Podrias quitar ' +
        'un panel y bajar el costo sin perder cobertura.'
      );
    }
    if (c >= 95) {
      return 'Tu sistema cubre practicamente todo tu consumo del ano.';
    }
    if (c >= 60) {
      return 'Buen avance: cubres la mayor parte del recibo. Un panel mas te acerca al 100 %.';
    }
    return 'Todavia queda lejos de tu consumo. Considera agregar mas paneles.';
  });

  /**
   * Partes que todo sistema necesita y no estan en el carrito.
   *
   * Importa para el retorno: con solo paneles, la inversion sale a la
   * mitad de lo que cuesta de verdad y el tiempo de recuperacion
   * aparece demasiado optimista. Mas vale decirlo que dar una cifra
   * que el cliente no va a ver cumplida.
   */
  readonly faltantes = computed(() => {
    const hay = new Set(this.items().map((i) => i.categoria));
    const necesarias: [string, string][] = [
      ['estructura', 'estructura de montaje'],
      ['inversor', 'inversor'],
      ['instalacion', 'instalacion'],
    ];

    return necesarias.filter(([c]) => !hay.has(c)).map(([, etiqueta]) => etiqueta);
  });

  readonly faltaSistema = computed(() => this.faltantes().length > 0);

  cambiarConsumo(evento: Event) {
    const valor = Number((evento.target as HTMLInputElement).value);
    if (!Number.isNaN(valor)) {
      this.consumo.set(valor);
    }
  }
}

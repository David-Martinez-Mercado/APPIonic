import {
  Component,
  computed,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MesSimulado } from '../models';

/**
 * Grafica de generacion mensual, dibujada en SVG.
 *
 * Se dibuja a mano en lugar de usar una libreria de graficas por tres
 * razones concretas: una libreria pesa mas que toda la aplicacion,
 * ninguna respeta la paleta sin pelearse con ella, y un SVG inline se
 * escala solo en un telefono sin tener que recalcular el canvas al
 * girar la pantalla.
 *
 * La interaccion es tocar una barra: se marca el mes y se muestran sus
 * numeros. En un telefono no hay "hover", asi que la seleccion es
 * explicita y se queda, en vez de aparecer y desaparecer.
 */
@Component({
  selector: 'app-grafica-solar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <figure class="grafica">
      <figcaption class="titulo">
        Generacion mensual estimada
        <span class="unidad">kWh</span>
      </figcaption>

      <!-- viewBox fijo + width 100%: el navegador escala el dibujo al
           ancho disponible sin que haya que medir nada en JavaScript. -->
      <svg
        [attr.viewBox]="'0 0 ' + ANCHO + ' ' + ALTO"
        class="lienzo"
        role="img"
        [attr.aria-label]="resumenAccesible()"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="degradadoBarra" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f0a93c" />
            <stop offset="100%" stop-color="#e08a1e" />
          </linearGradient>
        </defs>

        <!-- Lineas de referencia con su valor, para poder leer una
             barra sin tener que tocarla. -->
        @for (g of guias(); track g.valor) {
          <line
            class="guia"
            [attr.x1]="MARGEN_IZQ"
            [attr.x2]="ANCHO - MARGEN_DER"
            [attr.y1]="g.y"
            [attr.y2]="g.y"
          />
          <text class="etiqueta-eje" [attr.x]="MARGEN_IZQ - 6" [attr.y]="g.y + 4">
            {{ g.valor | number: '1.0-0' }}
          </text>
        }

        <!-- Consumo de la casa: es la linea que hay que alcanzar. Va
             despues de las guias para que quede por encima. -->
        <line
          class="linea-consumo"
          [attr.x1]="MARGEN_IZQ"
          [attr.x2]="ANCHO - MARGEN_DER"
          [attr.y1]="yConsumo()"
          [attr.y2]="yConsumo()"
        />
        <text
          class="etiqueta-consumo"
          [attr.x]="ANCHO - MARGEN_DER"
          [attr.y]="yConsumo() - 6"
        >
          consumo
        </text>

        @for (b of barras(); track b.mes) {
          <g
            class="columna"
            [class.activa]="seleccionado() === b.indice"
            (click)="seleccionar(b.indice)"
            (keydown.enter)="seleccionar(b.indice)"
            (keydown.space)="seleccionar(b.indice)"
            tabindex="0"
            role="button"
            [attr.aria-label]="
              b.mes + ': ' + b.generacion + ' kilovatios hora'
            "
          >
            <!-- Zona tactil completa de la columna: en un telefono el
                 dedo no acierta una barra de 14 px de ancho. -->
            <rect
              class="zona-tactil"
              [attr.x]="b.x - 2"
              [attr.y]="MARGEN_SUP"
              [attr.width]="anchoBarra() + 4"
              [attr.height]="ALTO - MARGEN_SUP - MARGEN_INF"
            />
            <rect
              class="barra"
              [attr.x]="b.x"
              [attr.y]="b.y"
              [attr.width]="anchoBarra()"
              [attr.height]="b.altura"
              rx="3"
              [style.animation-delay]="b.indice * 45 + 'ms'"
            />
            <text class="etiqueta-mes" [attr.x]="b.centro" [attr.y]="ALTO - 8">
              {{ b.mes }}
            </text>
          </g>
        }
      </svg>

      <!-- Detalle del mes tocado. Arranca en el mes de mayor
           generacion para que el panel no este vacio al abrir. -->
      @if (detalle(); as d) {
        <div class="detalle" [attr.data-mes]="d.mes">
          <strong class="mes-detalle">{{ d.mes }}</strong>
          <dl>
            <div>
              <dt>Genera</dt>
              <dd>{{ d.generacion | number: '1.0-0' }} kWh</dd>
            </div>
            <div>
              <dt>Consumo</dt>
              <dd>{{ d.consumo | number: '1.0-0' }} kWh</dd>
            </div>
            <div>
              <dt>Ahorro</dt>
              <dd class="ahorro">\${{ d.ahorro | number: '1.0-0' }}</dd>
            </div>
            <div>
              <dt>Sol</dt>
              <dd>{{ d.horasSol | number: '1.1-1' }} h/dia</dd>
            </div>
          </dl>
        </div>
      }

      <p class="pista">Toca una barra para ver el mes.</p>
    </figure>
  `,
  styles: [
    `
      .grafica {
        margin: 0;
      }

      .titulo {
        font-size: 0.95rem;
        font-weight: 600;
        color: #455a64;
        margin-bottom: 0.6rem;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }

      .unidad {
        font-size: 0.75rem;
        font-weight: 400;
        opacity: 0.7;
      }

      .lienzo {
        width: 100%;
        /* El texto del SVG se escala con el dibujo: a 1170 px de ancho
           las etiquetas del eje salian tres veces mas grandes que el
           resto de la pagina. Topando el ancho, el tipo se queda del
           tamano previsto y en un telefono sigue ocupando todo. */
        max-width: 520px;
        margin: 0 auto;
        height: auto;
        display: block;
        overflow: visible;
      }

      .guia {
        stroke: rgba(69, 90, 100, 0.15);
        stroke-width: 1;
      }

      .etiqueta-eje {
        font-size: 9px;
        fill: rgba(69, 90, 100, 0.6);
        text-anchor: end;
      }

      .linea-consumo {
        stroke: #c0392b;
        stroke-width: 1.5;
        stroke-dasharray: 5 4;
      }

      .etiqueta-consumo {
        font-size: 9px;
        fill: #c0392b;
        text-anchor: end;
      }

      .etiqueta-mes {
        font-size: 9px;
        fill: rgba(69, 90, 100, 0.75);
        text-anchor: middle;
      }

      .columna {
        cursor: pointer;
        outline: none;
      }

      .zona-tactil {
        fill: transparent;
      }

      .barra {
        fill: url(#degradadoBarra);
        /* El eje de la escala va abajo: la barra debe crecer desde el
           suelo, no estirarse desde su centro. */
        transform-box: fill-box;
        transform-origin: bottom;
        animation: crecer 520ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
      }

      .columna:hover .barra,
      .columna:focus-visible .barra {
        fill: #f0a93c;
      }

      .columna.activa .barra {
        fill: #455a64;
      }

      .columna:focus-visible .zona-tactil {
        fill: rgba(69, 90, 100, 0.08);
      }

      .columna.activa .etiqueta-mes {
        fill: #455a64;
        font-weight: 700;
      }

      @keyframes crecer {
        from {
          transform: scaleY(0);
        }
        to {
          transform: scaleY(1);
        }
      }

      /* Quien pidio menos movimiento ve la grafica ya dibujada. */
      @media (prefers-reduced-motion: reduce) {
        .barra {
          animation: none;
        }
      }

      .detalle {
        margin-top: 0.8rem;
        padding: 0.7rem 0.9rem;
        border-radius: 6px;
        background: rgba(69, 90, 100, 0.06);
        border-left: 3px solid #e08a1e;
      }

      .mes-detalle {
        display: block;
        font-size: 0.9rem;
        color: #455a64;
        margin-bottom: 0.4rem;
      }

      .detalle dl {
        margin: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        gap: 0.5rem 0.8rem;
      }

      .detalle dt {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.65;
        color: #455a64;
      }

      .detalle dd {
        margin: 0.1rem 0 0;
        font-size: 0.95rem;
        font-weight: 600;
        color: #455a64;
      }

      .detalle dd.ahorro {
        color: #2e7d32;
      }

      .pista {
        margin: 0.5rem 0 0;
        font-size: 0.72rem;
        text-align: center;
        opacity: 0.6;
        color: #455a64;
      }
    `,
  ],
})
export class GraficaSolarComponent {
  /** Los doce meses ya calculados. La grafica solo los dibuja. */
  meses = input.required<MesSimulado[]>();

  // Geometria del dibujo, en unidades del viewBox.
  readonly ANCHO = 340;
  readonly ALTO = 180;
  readonly MARGEN_IZQ = 30;
  readonly MARGEN_DER = 8;
  readonly MARGEN_SUP = 12;
  readonly MARGEN_INF = 22;

  /** Mes marcado por el usuario; null = el de mayor generacion. */
  private readonly elegido = signal<number | null>(null);

  /** Indice que esta resaltado ahora mismo. */
  readonly seleccionado = computed(() => {
    const manual = this.elegido();
    if (manual !== null) {
      return manual;
    }
    return this.indiceMaximo();
  });

  /**
   * Techo de la escala.
   *
   * Se toma el mayor entre generacion y consumo para que la linea de
   * consumo nunca se salga del dibujo: si el sistema queda corto, el
   * cliente tiene que poder ver cuanto le falta.
   */
  private readonly techo = computed(() => {
    const ms = this.meses();
    if (!ms.length) {
      return 1;
    }
    const maximo = Math.max(
      ...ms.map((m) => m.generacion),
      ...ms.map((m) => m.consumo),
    );
    // Se redondea hacia arriba a una centena para que las guias den
    // numeros legibles en vez de 437.
    return Math.max(100, Math.ceil(maximo / 100) * 100);
  });

  private readonly indiceMaximo = computed(() => {
    const ms = this.meses();
    if (!ms.length) {
      return 0;
    }
    let mejor = 0;
    ms.forEach((m, i) => {
      if (m.generacion > ms[mejor].generacion) {
        mejor = i;
      }
    });
    return mejor;
  });

  private readonly areaUtil = computed(() => this.ALTO - this.MARGEN_SUP - this.MARGEN_INF);

  readonly anchoBarra = computed(() => {
    const n = this.meses().length || 1;
    const disponible = this.ANCHO - this.MARGEN_IZQ - this.MARGEN_DER;
    // Se deja un cuarto del paso como separacion entre barras.
    return (disponible / n) * 0.62;
  });

  readonly barras = computed(() => {
    const ms = this.meses();
    const n = ms.length || 1;
    const disponible = this.ANCHO - this.MARGEN_IZQ - this.MARGEN_DER;
    const paso = disponible / n;
    const ancho = this.anchoBarra();

    return ms.map((m, i) => {
      const altura = (m.generacion / this.techo()) * this.areaUtil();
      const x = this.MARGEN_IZQ + paso * i + (paso - ancho) / 2;

      return {
        indice: i,
        mes: m.mes,
        generacion: Math.round(m.generacion),
        x,
        centro: x + ancho / 2,
        // El SVG mide desde arriba: la y de la barra es su punta.
        y: this.ALTO - this.MARGEN_INF - altura,
        altura: Math.max(altura, 0),
      };
    });
  });

  readonly guias = computed(() => {
    const techo = this.techo();
    const cortes = [0, 0.5, 1];

    return cortes.map((f) => ({
      valor: techo * f,
      y: this.ALTO - this.MARGEN_INF - f * this.areaUtil(),
    }));
  });

  readonly yConsumo = computed(() => {
    const consumo = this.meses()[0]?.consumo ?? 0;
    const f = consumo / this.techo();
    return this.ALTO - this.MARGEN_INF - f * this.areaUtil();
  });

  readonly detalle = computed(() => this.meses()[this.seleccionado()] ?? null);

  /** Texto de la grafica para un lector de pantalla. */
  readonly resumenAccesible = computed(() => {
    const ms = this.meses();
    if (!ms.length) {
      return 'Grafica sin datos.';
    }
    const mejor = ms[this.indiceMaximo()];
    return (
      `Generacion mensual estimada. El mes mas productivo es ${mejor.mes} ` +
      `con ${Math.round(mejor.generacion)} kilovatios hora.`
    );
  });

  seleccionar(indice: number) {
    // Volver a tocar el mismo mes no lo deselecciona: dejar el panel
    // vacio no le sirve a nadie.
    this.elegido.set(indice);
  }
}

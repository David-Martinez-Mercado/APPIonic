import { Component, input } from '@angular/core';

/**
 * Indicador de carga durante una peticion a la API.
 *
 * Hasta ahora el estado de carga solo se veia como texto ("Cargando...")
 * y como botones deshabilitados. Eso informa, pero no comunica que algo
 * esta ocurriendo: en una peticion de uno o dos segundos el usuario no
 * distingue entre "esta trabajando" y "se quedo colgado".
 *
 * Se usa de dos formas:
 *
 *   - En bloque, cuando la pantalla todavia no tiene nada que mostrar.
 *   - En linea (`[enLinea]="true"`), junto a un boton o dentro de una
 *     cabecera, cuando ya hay contenido y solo se esta refrescando.
 */
@Component({
  selector: 'app-cargando',
  standalone: true,
  template: `
    <div
      class="cargando"
      [class.en-linea]="enLinea()"
      role="status"
      aria-live="polite"
    >
      <span class="spinner" aria-hidden="true"></span>
      <span class="texto">{{ mensaje() }}</span>
    </div>
  `,
  styles: [
    `
      .cargando {
        align-items: center;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        justify-content: center;
        padding: 2rem 0;
      }

      /* Junto a un boton o en una cabecera: ocupa poco y no desplaza
         el contenido que ya esta en pantalla. */
      .cargando.en-linea {
        flex-direction: row;
        gap: 0.45rem;
        padding: 0.3rem 0;
      }

      .spinner {
        animation: giro 0.8s linear infinite;
        border: 3px solid rgba(69, 90, 100, 0.2);
        border-radius: 50%;
        border-top-color: #e08a1e;
        height: 26px;
        width: 26px;
      }

      .en-linea .spinner {
        border-width: 2px;
        height: 15px;
        width: 15px;
      }

      .texto {
        color: #546e7a;
        font-family: 'Roboto', sans-serif;
        font-size: 0.85rem;
      }

      .en-linea .texto {
        font-size: 0.78rem;
      }

      @keyframes giro {
        to {
          transform: rotate(360deg);
        }
      }

      /* Quien pidio reducir el movimiento ve el indicador quieto, con
         un latido suave en lugar de la rueda girando. */
      @media (prefers-reduced-motion: reduce) {
        .spinner {
          animation: latido 1.4s ease-in-out infinite;
        }

        @keyframes latido {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
      }
    `,
  ],
})
export class CargandoComponent {
  /** Texto que acompana al indicador. */
  mensaje = input('Cargando...');

  /** true lo deja en una fila, para usarlo junto a otros elementos. */
  enLinea = input(false);
}

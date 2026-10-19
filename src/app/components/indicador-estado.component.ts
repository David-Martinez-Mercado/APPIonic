import { Component, inject, computed } from '@angular/core';
import { ConexionService } from '../services/conexion.service';
import { PendientesRepository } from '../services/pendientes.repository';

/**
 * Indicador permanente de estado offline/online.
 *
 * El aviso grande (EstadoConexionComponent) solo aparece cuando algo
 * falla, que es lo correcto para no estorbar. Pero eso deja un vacio:
 * cuando todo funciona, nada confirma que la aplicacion esta realmente
 * sincronizada con el servidor.
 *
 * Este indicador vive siempre en la barra superior y responde de un
 * vistazo a tres preguntas:
 *
 *   - Hay conexion?
 *   - Esta respondiendo el servidor?
 *   - Queda algo sin enviar?
 */
@Component({
  selector: 'app-indicador-estado',
  standalone: true,
  template: `
    <div class="indicador" [class]="clase()" [title]="titulo()">
      <span class="punto" aria-hidden="true"></span>
      <span class="etiqueta">{{ etiqueta() }}</span>

      <!-- Lo que quedo sin enviar se muestra aparte: es informacion
           distinta de si hay red o no. -->
      @if (pendientes()) {
        <span class="pendientes" [title]="pendientes() + ' solicitud(es) sin enviar'">
          {{ pendientes() }}
        </span>
      }
    </div>
  `,
  styles: [
    `
      .indicador {
        align-items: center;
        border-radius: 12px;
        display: inline-flex;
        font-family: 'Roboto', sans-serif;
        font-size: 0.72rem;
        gap: 0.35rem;
        padding: 0.2rem 0.6rem;
      }

      .punto {
        border-radius: 50%;
        flex-shrink: 0;
        height: 8px;
        width: 8px;
      }

      /* Verde: hay red y el servidor responde. */
      .indicador.en-linea {
        background-color: rgba(27, 127, 75, 0.14);
        color: #10603a;
      }
      .en-linea .punto {
        background-color: #1b7f4b;
      }

      /* Ambar: no hay red. Es algo que el usuario puede resolver. */
      .indicador.sin-red {
        background-color: rgba(178, 106, 0, 0.16);
        color: #8a5300;
      }
      .sin-red .punto {
        animation: parpadeo 1.6s ease-in-out infinite;
        background-color: #b26a00;
      }

      /* Rojo: hay red pero el servidor no contesta. No depende del
         usuario, y por eso se distingue del caso anterior. */
      .indicador.sin-servidor {
        background-color: rgba(179, 38, 30, 0.14);
        color: #8c1d18;
      }
      .sin-servidor .punto {
        animation: parpadeo 1.6s ease-in-out infinite;
        background-color: #b3261e;
      }

      .pendientes {
        background-color: currentColor;
        border-radius: 8px;
        color: transparent;
        font-size: 0.66rem;
        font-weight: bold;
        min-width: 1rem;
        padding: 0 0.3rem;
        position: relative;
        text-align: center;
      }

      /* El numero se pinta sobre el fondo del propio estado, asi no
         hace falta un color extra que compita con el semaforo. */
      .pendientes::after {
        color: #fff;
        content: attr(title);
        display: none;
      }

      .indicador .pendientes {
        background-color: rgba(0, 0, 0, 0.55);
        color: #fff;
      }

      @keyframes parpadeo {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.35;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .punto {
          animation: none !important;
        }
      }
    `,
  ],
})
export class IndicadorEstadoComponent {
  private conexion = inject(ConexionService);
  private cola = inject(PendientesRepository);

  /** Cuantas solicitudes esperan a poder enviarse. */
  protected pendientes = computed(() => this.cola.pendientes().length);

  protected clase = computed(() => {
    if (!this.conexion.hayRed()) {
      return 'sin-red';
    }
    if (!this.conexion.servidorResponde()) {
      return 'sin-servidor';
    }
    return 'en-linea';
  });

  protected etiqueta = computed(() => {
    if (!this.conexion.hayRed()) {
      return 'Sin conexion';
    }
    if (!this.conexion.servidorResponde()) {
      return 'Servidor caido';
    }
    return 'En linea';
  });

  /** Detalle al pasar el cursor, para no alargar la etiqueta. */
  protected titulo = computed(() => {
    const contacto = this.conexion.ultimoContacto();
    const cuando = contacto
      ? ` Ultimo contacto: ${contacto.toLocaleTimeString()}.`
      : '';

    if (!this.conexion.hayRed()) {
      return `Sin red. Trabajando con los datos guardados.${cuando}`;
    }
    if (!this.conexion.servidorResponde()) {
      return `Hay red pero el servidor no responde.${cuando}`;
    }
    return `Sincronizado con el servidor.${cuando}`;
  });
}

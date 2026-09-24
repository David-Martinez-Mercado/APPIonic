import { Component, inject, signal, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ConexionService } from '../services/conexion.service';

/**
 * Aviso de estado de la conexion.
 *
 * Se pone una vez en cada pantalla y aparece solo cuando hace falta:
 * si todo funciona, no ocupa espacio ni distrae.
 *
 * Es un componente y no un bloque repetido en cada plantilla para que
 * las cinco pantallas digan exactamente lo mismo ante el mismo fallo,
 * y para que cambiar el texto sea un solo cambio.
 */
@Component({
  selector: 'app-estado-conexion',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (!conexion.enLinea()) {
      <div class="barra-conexion" [class.sin-red]="conexion.motivo() === 'sin_red'">
        <div class="texto">
          <strong>
            @if (conexion.motivo() === 'sin_red') {
              Sin conexion a internet
            } @else {
              El servidor no responde
            }
          </strong>
          <span>{{ conexion.mensaje() }}</span>

          @if (conexion.ultimoContacto()) {
            <span class="ultimo">
              Ultimo contacto:
              {{ conexion.ultimoContacto() | date: 'dd/MM/yyyy HH:mm' }}
            </span>
          }
        </div>

        <button
          type="button"
          class="reintentar"
          [disabled]="comprobando()"
          (click)="reintentar()"
        >
          {{ comprobando() ? 'Comprobando...' : 'Reintentar' }}
        </button>
      </div>
    }

    <!-- Aviso breve tras recuperar la conexion, para que el usuario
         sepa que ya puede volver a operar. -->
    @if (conexion.enLinea() && recuperada()) {
      <div class="barra-conexion recuperada">
        <div class="texto">
          <strong>Conexion restablecida</strong>
          <span>Los datos vuelven a estar sincronizados con el servidor.</span>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .barra-conexion {
        align-items: center;
        background-color: #fdecea;
        border-left: 4px solid #b3261e;
        border-radius: 4px;
        display: flex;
        gap: 0.7rem;
        justify-content: space-between;
        margin-bottom: 0.9rem;
        padding: 0.6rem 0.8rem;
      }

      /* Sin red es cosa del usuario; servidor caido no. Se distinguen
         por color para que no parezcan el mismo problema. */
      .barra-conexion.sin-red {
        background-color: #fff4e5;
        border-left-color: #b26a00;
      }

      .barra-conexion.recuperada {
        background-color: #e6f4ea;
        border-left-color: #1b7f4b;
      }

      .texto {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }

      strong {
        color: #8c1d18;
        font-size: 0.86rem;
      }

      .sin-red strong {
        color: #8a5300;
      }

      .recuperada strong {
        color: #10603a;
      }

      span {
        color: #5f4340;
        font-size: 0.79rem;
      }

      .sin-red span {
        color: #7a5a2e;
      }

      .recuperada span {
        color: #2c6b4a;
      }

      .ultimo {
        font-style: italic;
        opacity: 0.85;
      }

      .reintentar {
        background: none;
        border: 1px solid rgba(179, 38, 30, 0.5);
        border-radius: 3px;
        color: #8c1d18;
        cursor: pointer;
        flex-shrink: 0;
        font-family: 'Roboto', sans-serif;
        font-size: 0.78rem;
        padding: 0.32rem 0.8rem;
      }

      .sin-red .reintentar {
        border-color: rgba(178, 106, 0, 0.5);
        color: #8a5300;
      }

      .reintentar:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
    `,
  ],
})
export class EstadoConexionComponent {
  protected conexion = inject(ConexionService);

  /** Qué recargar cuando el usuario pulsa "Reintentar". */
  recargar = input<() => Promise<unknown>>();

  protected comprobando = signal(false);

  /** Controla el aviso verde, que dura unos segundos y desaparece. */
  protected recuperada = signal(false);

  /**
   * Comprueba de nuevo y, si hay servidor, recarga la pantalla.
   *
   * Se pregunta al servidor en lugar de confiar en el estado guardado:
   * el usuario pulsa este boton justo porque cree que ya se arreglo.
   */
  protected async reintentar(): Promise<void> {
    if (this.comprobando()) {
      return;
    }

    this.comprobando.set(true);
    try {
      const hayServidor = await this.conexion.comprobar();

      if (hayServidor) {
        const recarga = this.recargar();
        if (recarga) {
          await recarga();
        }
        this.avisarRecuperacion();
      }
    } finally {
      this.comprobando.set(false);
    }
  }

  private avisarRecuperacion(): void {
    this.recuperada.set(true);
    setTimeout(() => this.recuperada.set(false), 4000);
  }
}

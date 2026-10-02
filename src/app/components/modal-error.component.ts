import { Component, input, output, signal, computed } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { ApiError } from '../models';

/**
 * Modal con el detalle tecnico de un error de la API.
 *
 * El aviso que ve el usuario es corto y en lenguaje llano; aqui esta lo
 * que hace falta para diagnosticar: a donde se mando la peticion, que se
 * envio, que contesto el servidor y como estaba la red en ese momento.
 *
 * Es un componente y no un bloque repetido en cada pantalla para que
 * todas muestren la misma informacion con el mismo formato.
 */
@Component({
  selector: 'app-modal-error',
  standalone: true,
  imports: [DatePipe, JsonPipe],
  template: `
    @if (error(); as e) {
      <div class="fondo">
        <!-- Capa que cierra al pulsarla. Es un boton y no un div para
             que tambien responda al teclado. -->
        <button
          type="button"
          class="capa-cierre"
          aria-label="Cerrar el detalle del error"
          (click)="cerrar.emit()"
        ></button>

        <div class="cuadro" role="dialog" aria-modal="true"
             aria-label="Detalle del error">

          <div class="encabezado" [class.sin-red]="esFalloDeRed()">
            <div>
              <strong>{{ esFalloDeRed() ? 'Sin conexion con el servidor' : 'El servidor rechazo la peticion' }}</strong>
              <span class="codigo">
                {{ esFalloDeRed() ? 'Sin respuesta' : 'Codigo ' + e.codigo }}
              </span>
            </div>
            <button type="button" class="cerrar" (click)="cerrar.emit()"
                    aria-label="Cerrar">&times;</button>
          </div>

          <div class="cuerpo">
            <p class="mensaje">{{ e.message }}</p>

            @if (e.diagnostico; as d) {
              <!-- A donde se mando: lo primero que hay que revisar si la
                   IP configurada no es la correcta. -->
              <h4>Peticion</h4>
              <dl>
                <dt>Metodo</dt>
                <dd><code>{{ d.metodo }}</code></dd>

                <dt>URL</dt>
                <dd><code class="url">{{ d.url }}</code></dd>

                <dt>Servidor</dt>
                <dd><code>{{ hostDe(d.url) }}</code></dd>

                @if (d.intentos && d.intentos > 1) {
                  <dt>Intentos</dt>
                  <dd>{{ d.intentos }}</dd>
                }

                @if (d.ms !== undefined) {
                  <dt>Duracion</dt>
                  <dd>{{ d.ms }} ms</dd>
                }

                <dt>Momento</dt>
                <dd>{{ d.fecha | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
              </dl>

              <!-- Estado de la red: distingue "no hay wifi" de "el
                   servidor no contesta", que son problemas distintos. -->
              <h4>Estado de la red</h4>
              <dl>
                <dt>Conexion</dt>
                <dd>
                  <span class="punto" [class.ok]="d.hayRed"></span>
                  {{ d.hayRed ? 'Con red' : 'Sin red' }}
                </dd>

                @if (d.tipoRed) {
                  <dt>Tipo</dt>
                  <dd>{{ d.tipoRed }}</dd>
                }
              </dl>

              @if (d.payload !== undefined && d.payload !== null) {
                <h4>
                  Payload enviado
                  <button type="button" class="alternar" (click)="verPayload.set(!verPayload())">
                    {{ verPayload() ? 'Ocultar' : 'Mostrar' }}
                  </button>
                </h4>
                @if (verPayload()) {
                  <pre>{{ ocultarClaves(d.payload) | json }}</pre>
                }
              }

              @if (d.estado !== undefined) {
                <h4>Respuesta</h4>
                <dl>
                  <dt>Estado HTTP</dt>
                  <dd><code>{{ d.estado }}</code></dd>
                </dl>

                @if (d.respuesta) {
                  <pre>{{ d.respuesta | json }}</pre>
                }
              }

              @if (d.cabeceras && tieneCabeceras(d.cabeceras)) {
                <h4>
                  Cabeceras
                  <button type="button" class="alternar" (click)="verCabeceras.set(!verCabeceras())">
                    {{ verCabeceras() ? 'Ocultar' : 'Mostrar' }}
                  </button>
                </h4>
                @if (verCabeceras()) {
                  <dl class="cabeceras">
                    @for (c of listaCabeceras(d.cabeceras); track c.clave) {
                      <dt>{{ c.clave }}</dt>
                      <dd><code>{{ c.valor }}</code></dd>
                    }
                  </dl>
                }
              }
            }

            @if (e.detalles) {
              <h4>Detalles</h4>
              <pre>{{ e.detalles | json }}</pre>
            }
          </div>

          <div class="pie">
            @if (permiteReintentar()) {
              <button type="button" class="secundario" (click)="reintentar.emit()">
                Reintentar
              </button>
            }
            <button type="button" class="primario" (click)="cerrar.emit()">Cerrar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .fondo {
        align-items: center;
        background-color: rgba(38, 50, 56, 0.72);
        bottom: 0;
        display: flex;
        justify-content: center;
        left: 0;
        padding: 1rem;
        position: fixed;
        right: 0;
        top: 0;
        z-index: 1000;
      }

      /* Cubre toda la pantalla por detras del cuadro. */
      .capa-cierre {
        background: none;
        border: none;
        bottom: 0;
        cursor: default;
        left: 0;
        padding: 0;
        position: absolute;
        right: 0;
        top: 0;
      }

      .cuadro {
        background-color: #fff;
        position: relative;
        z-index: 1;
        border-radius: 6px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        font-family: 'Roboto', sans-serif;
        max-height: 85vh;
        max-width: 560px;
        width: 100%;
      }

      .encabezado {
        align-items: flex-start;
        background-color: #fdecea;
        border-bottom: 1px solid rgba(179, 38, 30, 0.25);
        border-radius: 6px 6px 0 0;
        display: flex;
        justify-content: space-between;
        padding: 0.8rem 0.9rem;

        strong {
          color: #8c1d18;
          display: block;
          font-size: 0.95rem;
        }

        .codigo {
          color: #a33b34;
          font-size: 0.75rem;
        }
      }

      /* Sin red es cosa del usuario; que el servidor rechace no lo es. */
      .encabezado.sin-red {
        background-color: #fff4e5;
        border-bottom-color: rgba(178, 106, 0, 0.25);

        strong {
          color: #8a5300;
        }

        .codigo {
          color: #9a6a18;
        }
      }

      .cerrar {
        background: none;
        border: none;
        color: #8c1d18;
        cursor: pointer;
        font-size: 1.5rem;
        line-height: 1;
        padding: 0 0.2rem;
      }

      .cuerpo {
        overflow-y: auto;
        padding: 0.9rem;
      }

      .mensaje {
        color: #37474f;
        font-size: 0.88rem;
        margin: 0 0 0.9rem;
      }

      h4 {
        align-items: center;
        border-bottom: 1px solid rgba(69, 90, 100, 0.18);
        color: #455a64;
        display: flex;
        font-size: 0.8rem;
        gap: 0.5rem;
        justify-content: space-between;
        margin: 0.9rem 0 0.4rem;
        padding-bottom: 0.2rem;
        text-transform: uppercase;
      }

      .alternar {
        background: none;
        border: none;
        color: #e08a1e;
        cursor: pointer;
        font-family: 'Roboto', sans-serif;
        font-size: 0.72rem;
        padding: 0;
        text-transform: none;
        text-decoration: underline;
      }

      dl {
        display: grid;
        gap: 0.15rem 0.7rem;
        grid-template-columns: auto 1fr;
        margin: 0;
      }

      dt {
        color: #78909c;
        font-size: 0.76rem;
      }

      dd {
        color: #37474f;
        font-size: 0.78rem;
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      code {
        background-color: #eceff1;
        border-radius: 2px;
        font-family: Consolas, monospace;
        font-size: 0.75rem;
        padding: 0.05rem 0.25rem;
      }

      .url {
        overflow-wrap: anywhere;
      }

      pre {
        background-color: #263238;
        border-radius: 3px;
        color: #cfd8dc;
        font-family: Consolas, monospace;
        font-size: 0.72rem;
        margin: 0.3rem 0 0;
        max-height: 180px;
        overflow: auto;
        padding: 0.6rem;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .punto {
        background-color: #b3261e;
        border-radius: 50%;
        display: inline-block;
        height: 7px;
        margin-right: 0.25rem;
        width: 7px;

        &.ok {
          background-color: #1b7f4b;
        }
      }

      .cabeceras dt {
        font-family: Consolas, monospace;
        font-size: 0.72rem;
      }

      .pie {
        border-top: 1px solid rgba(69, 90, 100, 0.18);
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        padding: 0.7rem 0.9rem;
      }

      .primario,
      .secundario {
        border-radius: 3px;
        cursor: pointer;
        font-family: 'Roboto', sans-serif;
        font-size: 0.84rem;
        padding: 0.45rem 1rem;
      }

      .primario {
        background-color: #455a64;
        border: 1px solid #455a64;
        color: #fff;
      }

      .secundario {
        background: none;
        border: 1px solid rgba(69, 90, 100, 0.45);
        color: #455a64;
      }
    `,
  ],
})
export class ModalErrorComponent {
  /** El error a mostrar. null cierra el modal. */
  error = input<ApiError | null>(null);

  /**
   * Si se ofrece el boton de reintentar.
   *
   * Lo decide quien usa el modal: reintentar tiene sentido tras un
   * fallo de red, pero no tras un 409 por datos duplicados.
   */
  permiteReintentar = input(false);

  cerrar = output<void>();
  reintentar = output<void>();

  protected verPayload = signal(false);
  protected verCabeceras = signal(false);

  /** Codigo 0 = no hubo respuesta del servidor. */
  protected esFalloDeRed = computed(() => this.error()?.codigo === 0);

  /** Extrae el host de la URL, que es el dato que mas se revisa. */
  protected hostDe(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  protected tieneCabeceras(c: Record<string, string>): boolean {
    return Object.keys(c).length > 0;
  }

  protected listaCabeceras(c: Record<string, string>) {
    return Object.entries(c).map(([clave, valor]) => ({ clave, valor }));
  }

  /**
   * Quita las contrasenas antes de mostrar el payload.
   *
   * El modal es para diagnosticar, y una contrasena en pantalla no
   * ayuda a diagnosticar nada: solo la deja a la vista de quien pase.
   */
  protected ocultarClaves(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const copia: Record<string, unknown> = { ...(payload as Record<string, unknown>) };

    for (const clave of Object.keys(copia)) {
      if (/password|contrasena|clave|token/i.test(clave)) {
        copia[clave] = '********';
      }
    }
    return copia;
  }
}

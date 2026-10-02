import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular';
import { ServidorService, ResultadoPrueba } from '../services/servidor.service';
import { ConexionService } from '../services/conexion.service';
import { ENDPOINTS } from '../models';

/**
 * Origenes de datos.
 *
 * Muestra a donde apunta la aplicacion: protocolo, IP, puertos y los
 * endpoints que consume, tal como estan guardados en el JSON del
 * dispositivo.
 *
 * Existe porque en una aplicacion cuya direccion es configurable, saber
 * contra que servidor se esta trabajando deja de ser evidente. Esta
 * pantalla lo responde sin tener que abrir las herramientas de
 * desarrollo.
 */
@Component({
  selector: 'app-tab6',
  templateUrl: 'tab6.page.html',
  styleUrls: ['tab6.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, DatePipe, JsonPipe],
})
export class Tab6Page implements OnInit {
  private servidor = inject(ServidorService);
  private conexion = inject(ConexionService);

  /** El JSON completo, tal como esta en el dispositivo. */
  origen = this.servidor.origen;
  json = this.servidor.json;

  /** Estado de la red, para el encabezado. */
  hayRed = this.conexion.hayRed;
  tipoRed = this.conexion.tipoRed;
  enLinea = this.conexion.enLinea;
  servidorResponde = this.conexion.servidorResponde;
  ultimoContacto = this.conexion.ultimoContacto;

  endpoints = ENDPOINTS;

  probando = signal(false);
  resultado = signal<ResultadoPrueba | null>(null);

  /** El JSON crudo se oculta por omision: es para quien lo necesite. */
  verJson = signal(false);

  /** URLs completas de cada endpoint, ya con la direccion configurada. */
  urls = computed(() => {
    const base = this.servidor.base();
    const ruta = this.origen().rutaApi;

    return this.endpoints.map((e) => ({
      ...e,
      url: `${base}${ruta}/${e.archivo}`,
    }));
  });

  /** Cabeceras de la ultima prueba, como lista para la plantilla. */
  cabeceras = computed(() => {
    const c = this.resultado()?.cabeceras;
    return c ? Object.entries(c).map(([clave, valor]) => ({ clave, valor })) : [];
  });

  async ngOnInit() {
    await this.servidor.listo();
  }

  /** Comprueba el servidor y guarda el resultado en el JSON. */
  async probar() {
    if (this.probando()) {
      return;
    }

    this.probando.set(true);
    try {
      const r = await this.servidor.probar();
      this.resultado.set(r);
      await this.servidor.registrarPrueba(r);
    } finally {
      this.probando.set(false);
    }
  }

  /** Copia el JSON al portapapeles, para poder pegarlo en un reporte. */
  async copiarJson() {
    try {
      await navigator.clipboard.writeText(this.json());
    } catch {
      // Sin permiso de portapapeles no se puede hacer nada util:
      // el JSON sigue visible en pantalla para copiarlo a mano.
    }
  }
}

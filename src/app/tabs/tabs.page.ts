import { Component, OnInit, inject, computed } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonBadge,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  personCircleOutline,
  sunnyOutline,
  cartOutline,
  constructOutline,
  clipboardOutline,
} from 'ionicons/icons';
import { CarritoRepository } from '../services/carrito.repository';
import { SesionService } from '../services/sesion.service';
import { ConexionService } from '../services/conexion.service';

/**
 * Barra de navegacion.
 *
 * Ademas de enlazar las vistas hace dos cosas: muestra cuantas piezas
 * hay en el carrito y decide si la pestana de administracion existe,
 * segun el rol del usuario que tiene la sesion abierta.
 */
@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
})
export class TabsPage implements OnInit {
  private carrito = inject(CarritoRepository);
  private sesion = inject(SesionService);
  private conexion = inject(ConexionService);

  /** Piezas en el carrito, para el globo del icono. */
  piezas = this.carrito.piezas;

  /** Solo el administrador ve la pestana de gestion de solicitudes. */
  esAdmin = computed(() => this.sesion.usuario()?.rol === 'admin');

  constructor() {
    addIcons({
      personCircleOutline,
      sunnyOutline,
      cartOutline,
      constructOutline,
      clipboardOutline,
    });
  }

  /**
   * Se restauran sesion y carrito al arrancar.
   *
   * La barra es el primer componente que se monta, asi que es el lugar
   * natural para leer el dispositivo una sola vez: cuando las vistas
   * se abran, los datos ya estan en memoria.
   */
  async ngOnInit() {
    // La deteccion de red se activa primero: si la aplicacion arranca
    // sin conexion, las vistas ya encuentran el estado correcto en vez
    // de intentar una peticion y fallar sin explicacion.
    await this.conexion.iniciar();
    await this.sesion.restaurar();
    await this.carrito.cargar();
  }
}

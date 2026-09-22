import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        // Acceso: inicio de sesion y registro
        path: 'tab1',
        loadComponent: () => import('../tab1/tab1.page').then((m) => m.Tab1Page),
      },
      {
        // Catalogo de paneles, estructuras, baterias e inversores
        path: 'tab2',
        loadComponent: () => import('../tab2/tab2.page').then((m) => m.Tab2Page),
      },
      {
        // Carrito guardado en el dispositivo
        path: 'tab3',
        loadComponent: () => import('../tab3/tab3.page').then((m) => m.Tab3Page),
      },
      {
        // Seguimiento: en que paso va cada pedido del cliente
        path: 'tab4',
        loadComponent: () => import('../tab4/tab4.page').then((m) => m.Tab4Page),
      },
      {
        // Administracion: aprobar, rechazar y agendar solicitudes
        path: 'tab5',
        loadComponent: () => import('../tab5/tab5.page').then((m) => m.Tab5Page),
      },
      {
        path: '',
        redirectTo: '/tabs/tab2',
        pathMatch: 'full',
      },
    ],
  },
  {
    // La aplicacion abre en el catalogo: es lo primero que un cliente
    // quiere ver, y no obliga a iniciar sesion para mirar precios.
    path: '',
    redirectTo: '/tabs/tab2',
    pathMatch: 'full',
  },
];

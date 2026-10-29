import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: "io.ionic.demo.pg.cap.ng",
  appName: "SolarApp",
  npmClient: "npm",
  webDir: "www",

  server: {
    /**
     * Permite que la aplicacion instalada hable con la API por HTTP.
     *
     * Desde Android 9 el sistema bloquea el trafico sin cifrar. La API
     * de este proyecto corre sobre Apache en el puerto 80 de una IP de
     * red local, asi que sin esto el APK no puede pedir nada: las
     * peticiones fallan antes de salir del telefono.
     *
     * Es aceptable porque el servidor vive en la misma red local que el
     * dispositivo. Una aplicacion publicada tendria que usar HTTPS.
     */
    cleartext: true,
  },
};

export default config;

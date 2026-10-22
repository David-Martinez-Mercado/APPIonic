/**
 * Simulacion de generacion y ahorro de un proyecto solar.
 *
 * Es lo que convierte una lista de precios en una decision de compra:
 * el cliente no compra paneles, compra dejar de pagar luz. Hasta ahora
 * la aplicacion mostraba cuanto cuesta el sistema pero no cuanto
 * genera, que es justo el dato por el que se decide.
 *
 * Todo se calcula en el dispositivo a partir de la potencia que ya
 * viene en el catalogo, asi que la grafica funciona sin conexion igual
 * que el carrito.
 */

/** Horas solares pico al dia, promedio por mes, para Durango. */
export const HORAS_SOL_DURANGO: number[] = [
  5.3, 6.0, 6.8, 7.4, 7.6, 7.0, 6.2, 6.2, 5.8, 5.6, 5.3, 4.9,
];

export const MESES: string[] = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/**
 * Perdidas del sistema: cableado, temperatura, suciedad e inversor.
 *
 * Un panel de 550 W nunca entrega 550 W reales. El factor estandar de
 * la industria ronda 0.78; usarlo evita prometer una generacion que el
 * sistema no va a dar.
 */
export const FACTOR_RENDIMIENTO = 0.78;

/** Pesos por kWh. Tarifa domestica de referencia (CFE 1C, 2026). */
export const PRECIO_KWH = 4.2;

/** Consumo mensual tipico de una casa, en kWh. Es el valor de partida. */
export const CONSUMO_MENSUAL_DEFECTO = 350;

/** Un mes de la simulacion. */
export interface MesSimulado {
  mes: string;
  /** Horas solares pico promedio de ese mes. */
  horasSol: number;
  /** kWh que genera el sistema en el mes. */
  generacion: number;
  /** kWh que consume la casa en el mes. */
  consumo: number;
  /** Pesos que deja de pagar, sin pasar de lo que consume. */
  ahorro: number;
}

/** Resultado completo de la simulacion. */
export interface Simulacion {
  /** Potencia instalada en watts pico. */
  potenciaW: number;
  /** Cuantos paneles hay en el proyecto. */
  paneles: number;
  /** Capacidad de respaldo en kWh, si hay baterias. */
  respaldoKwh: number;
  /** Generacion anual en kWh. */
  generacionAnual: number;
  /** Consumo anual en kWh. */
  consumoAnual: number;
  /** Ahorro anual en pesos. */
  ahorroAnual: number;
  /**
   * Porcentaje del consumo que cubre el sistema.
   *
   * Puede pasar de 100 si el sistema genera de mas: se informa tal
   * cual, porque sobredimensionar es un error que conviene ver.
   */
  cobertura: number;
  /** Anos para recuperar la inversion; null si no hay generacion. */
  retornoAnios: number | null;
  meses: MesSimulado[];
}

/**
 * Calcula la simulacion a partir de la potencia instalada.
 *
 * Se recibe la potencia ya sumada en vez de el carrito entero para que
 * esta funcion no dependa de como esta armado el carrito: se puede
 * probar con numeros sueltos.
 */
export function simular(
  potenciaW: number,
  consumoMensual: number,
  inversion: number,
  paneles = 0,
  respaldoKwh = 0,
): Simulacion {
  const kw = potenciaW / 1000;

  const meses: MesSimulado[] = MESES.map((mes, i) => {
    const horasSol = HORAS_SOL_DURANGO[i];
    // kWh del mes = kW instalados x horas sol al dia x dias x rendimiento
    const dias = diasDelMes(i);
    const generacion = kw * horasSol * dias * FACTOR_RENDIMIENTO;

    // El ahorro se topa en el consumo: lo que se genera de mas no se
    // paga, solo queda como excedente a favor en el medidor.
    const aprovechado = Math.min(generacion, consumoMensual);

    return {
      mes,
      horasSol,
      generacion: redondear(generacion),
      consumo: consumoMensual,
      ahorro: redondear(aprovechado * PRECIO_KWH),
    };
  });

  const generacionAnual = redondear(meses.reduce((s, m) => s + m.generacion, 0));
  const consumoAnual = consumoMensual * 12;
  const ahorroAnual = redondear(meses.reduce((s, m) => s + m.ahorro, 0));

  return {
    potenciaW,
    paneles,
    respaldoKwh,
    generacionAnual,
    consumoAnual,
    ahorroAnual,
    cobertura: consumoAnual ? Math.round((generacionAnual / consumoAnual) * 100) : 0,
    // Sin ahorro no hay retorno: devolver un numero enorme seria
    // mentir, y devolver cero seria peor.
    retornoAnios: ahorroAnual > 0 ? redondear(inversion / ahorroAnual) : null,
    meses,
  };
}

function diasDelMes(indice: number): number {
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][indice];
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

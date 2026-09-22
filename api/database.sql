-- ============================================================
--  SolarApp - Base de datos
--  Venta de paneles solares con instalacion y seguimiento
--  de proyectos.
--
--  Importar desde phpMyAdmin:  Importar > Elegir archivo > Continuar
-- ============================================================

CREATE DATABASE IF NOT EXISTS app_usuarios
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE app_usuarios;

-- El orden importa: se borran primero las tablas que dependen de otras.
DROP TABLE IF EXISTS pedido_historial;
DROP TABLE IF EXISTS pedido_detalle;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS usuarios;

-- ============================================================
--  usuarios
--  Se conserva del proyecto anterior y se le agrega el rol,
--  que es lo que separa al cliente del administrador.
-- ============================================================
CREATE TABLE usuarios (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  email      VARCHAR(150) NOT NULL UNIQUE,
  full_name  VARCHAR(150) NOT NULL,
  password   VARCHAR(255) NOT NULL,          -- hash bcrypt (password_hash)
  -- 'cliente' arma solicitudes; 'admin' las aprueba, rechaza y agenda.
  rol        ENUM('cliente','admin') NOT NULL DEFAULT 'cliente',
  telefono   VARCHAR(20)  NULL,
  direccion  VARCHAR(255) NULL,
  activo     TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  productos
--  Catalogo: paneles, estructuras, baterias, inversores y el
--  servicio de instalacion.
-- ============================================================
CREATE TABLE productos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sku         VARCHAR(40)  NOT NULL UNIQUE,
  nombre      VARCHAR(150) NOT NULL,
  descripcion TEXT         NULL,
  categoria   ENUM('panel','estructura','bateria','inversor','instalacion','accesorio')
              NOT NULL,
  -- DECIMAL y no FLOAT: con dinero, el redondeo binario de FLOAT
  -- produce diferencias de centavos al sumar.
  precio      DECIMAL(10,2) NOT NULL,
  -- Potencia en watts (paneles/inversores) o capacidad en Ah (baterias).
  potencia_w  INT          NULL,
  unidad      VARCHAR(20)  NOT NULL DEFAULT 'pieza',
  imagen_url  VARCHAR(500) NULL,
  stock       INT          NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_categoria (categoria),
  INDEX idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  pedidos
--  Una solicitud de proyecto solar. No es una compra inmediata:
--  el cliente la envia, el administrador la revisa y decide.
-- ============================================================
CREATE TABLE pedidos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  folio       VARCHAR(20)  NOT NULL UNIQUE,   -- SOL-2026-0001
  usuario_id  INT          NOT NULL,

  -- Ciclo de vida del proyecto. El orden de los valores es el
  -- orden real del proceso, asi la barra de progreso de la app
  -- se calcula con la posicion dentro del ENUM.
  estado ENUM(
    'solicitado',     -- el cliente la envio, nadie la ha visto
    'en_revision',    -- un administrador la esta evaluando
    'aprobado',       -- aprobada, con fecha de visita tecnica
    'agendado',       -- fecha de instalacion confirmada
    'en_instalacion', -- la cuadrilla esta en sitio
    'completado',     -- sistema instalado y funcionando
    'rechazado',      -- no procede; el motivo es obligatorio
    'cancelado'       -- el cliente se echo para atras
  ) NOT NULL DEFAULT 'solicitado',

  -- Domicilio donde se instalara. Se copia del usuario al crear
  -- el pedido, pero se guarda aparte: si el cliente cambia su
  -- direccion despues, el pedido debe conservar la de entonces.
  direccion_instalacion VARCHAR(255) NOT NULL,
  ciudad      VARCHAR(100) NULL,
  telefono_contacto VARCHAR(20) NULL,
  notas_cliente TEXT       NULL,

  -- Importes congelados al momento de solicitar.
  subtotal    DECIMAL(10,2) NOT NULL DEFAULT 0,
  iva         DECIMAL(10,2) NOT NULL DEFAULT 0,
  total       DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Lo que llena el administrador al revisar.
  fecha_visita       DATE NULL,
  fecha_instalacion  DATE NULL,
  notas_admin        TEXT NULL,
  motivo_rechazo     TEXT NULL,
  revisado_por       INT  NULL,

  creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_pedido_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE RESTRICT,          -- no se borra un cliente con pedidos
  CONSTRAINT fk_pedido_revisor
    FOREIGN KEY (revisado_por) REFERENCES usuarios(id)
    ON DELETE SET NULL,          -- si se va el admin, el pedido queda
  INDEX idx_usuario (usuario_id),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  pedido_detalle
--  Las partidas del pedido: que producto y cuantos.
-- ============================================================
CREATE TABLE pedido_detalle (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id   INT NOT NULL,
  producto_id INT NOT NULL,

  -- El nombre y el precio se copian, no se leen del catalogo al
  -- mostrar el pedido: si manana sube el precio o se renombra el
  -- producto, el pedido historico debe seguir mostrando lo que
  -- el cliente vio y acepto.
  nombre_producto VARCHAR(150)  NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  cantidad        INT           NOT NULL,
  -- Columna calculada: MySQL la mantiene, nadie puede desincronizarla.
  importe DECIMAL(12,2) AS (precio_unitario * cantidad) STORED,

  CONSTRAINT fk_detalle_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    ON DELETE CASCADE,           -- al borrar el pedido se van sus partidas
  CONSTRAINT fk_detalle_producto
    FOREIGN KEY (producto_id) REFERENCES productos(id)
    ON DELETE RESTRICT,
  INDEX idx_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  pedido_historial
--  Bitacora de cambios de estado. Es lo que permite que el
--  cliente vea "en que proceso va" su pedido, con fechas.
-- ============================================================
CREATE TABLE pedido_historial (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id   INT NOT NULL,
  estado      VARCHAR(30)  NOT NULL,
  comentario  TEXT         NULL,
  usuario_id  INT          NULL,   -- quien hizo el cambio
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_hist_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_hist_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE SET NULL,
  INDEX idx_pedido_hist (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  Datos de prueba
-- ============================================================

-- La contrasena de todos los usuarios es: 123456
-- (hash generado con password_hash('123456', PASSWORD_DEFAULT))
INSERT INTO usuarios (username, email, full_name, password, rol, telefono, direccion) VALUES
  ('admin', 'admin@solarapp.com', 'Administrador',
   '$2y$10$D2Bsd2frb82hFv8uKOhzwOdeA5aYT6Rd4BEGOSOTuqeJ6bhzRdSxm', 'admin',
   '618-100-0000', 'Oficina central, Durango'),
  ('dmartinez', 'd.martinez.isw@unipolidgo.edu.mx', 'D. Martinez',
   '$2y$10$D2Bsd2frb82hFv8uKOhzwOdeA5aYT6Rd4BEGOSOTuqeJ6bhzRdSxm', 'cliente',
   '618-200-1111', 'Av. Universidad 123, Durango'),
  ('lgomez', 'laura.gomez@demo.com', 'Laura Gomez',
   '$2y$10$D2Bsd2frb82hFv8uKOhzwOdeA5aYT6Rd4BEGOSOTuqeJ6bhzRdSxm', 'cliente',
   '618-300-2222', 'Calle Pino 45, Durango');

-- Catalogo. Las imagenes son de Pexels (uso libre, sin atribucion).
INSERT INTO productos
  (sku, nombre, descripcion, categoria, precio, potencia_w, unidad, imagen_url, stock) VALUES

  ('PAN-550M', 'Panel monocristalino 550 W',
   'Panel de alta eficiencia para instalaciones residenciales. 144 celdas, 21.3% de eficiencia, 25 anos de garantia de produccion.',
   'panel', 4850.00, 550, 'pieza',
   'https://images.pexels.com/photos/356036/pexels-photo-356036.jpeg?auto=compress&cs=tinysrgb&w=600', 120),

  ('PAN-450M', 'Panel monocristalino 450 W',
   'Modelo compacto para techos con espacio limitado. Buen rendimiento con poca luz y marco reforzado.',
   'panel', 3990.00, 450, 'pieza',
   'https://images.pexels.com/photos/356049/pexels-photo-356049.jpeg?auto=compress&cs=tinysrgb&w=600', 85),

  ('EST-RIEL4', 'Estructura de montaje para 4 paneles',
   'Riel de aluminio anodizado con herrajes de acero inoxidable. Para techo inclinado de lamina o teja.',
   'estructura', 2750.00, NULL, 'juego',
   'https://images.pexels.com/photos/8853500/pexels-photo-8853500.jpeg?auto=compress&cs=tinysrgb&w=600', 40),

  ('EST-SUELO8', 'Estructura de piso para 8 paneles',
   'Soporte para instalacion en suelo, con angulo ajustable segun la latitud. Incluye anclajes de concreto.',
   'estructura', 6400.00, NULL, 'juego',
   'https://images.pexels.com/photos/433308/pexels-photo-433308.jpeg?auto=compress&cs=tinysrgb&w=600', 18),

  ('BAT-LIT5K', 'Bateria de litio 5 kWh',
   'Almacenamiento LiFePO4 para respaldo nocturno. Mas de 6000 ciclos de carga y monitoreo integrado.',
   'bateria', 32500.00, NULL, 'pieza',
   'https://images.pexels.com/photos/35425766/pexels-photo-35425766.jpeg?auto=compress&cs=tinysrgb&w=600', 15),

  ('BAT-LIT10K', 'Bateria de litio 10 kWh',
   'Version de mayor capacidad para viviendas con consumo alto o respaldo prolongado.',
   'bateria', 58900.00, NULL, 'pieza',
   'https://images.pexels.com/photos/2800832/pexels-photo-2800832.jpeg?auto=compress&cs=tinysrgb&w=600', 8),

  ('INV-5KW', 'Inversor hibrido 5 kW',
   'Admite red y baterias. Monitoreo por aplicacion y proteccion contra sobrecarga.',
   'inversor', 24800.00, 5000, 'pieza',
   'https://images.pexels.com/photos/9875441/pexels-photo-9875441.jpeg?auto=compress&cs=tinysrgb&w=600', 22),

  ('INV-3KW', 'Inversor de red 3 kW',
   'Para sistemas interconectados a CFE sin respaldo de bateria. Arranque automatico.',
   'inversor', 15600.00, 3000, 'pieza',
   'https://images.pexels.com/photos/414837/pexels-photo-414837.jpeg?auto=compress&cs=tinysrgb&w=600', 30),

  ('INS-RESID', 'Instalacion residencial',
   'Mano de obra, cableado, puesta en marcha y tramite de interconexion ante CFE. Precio por sistema.',
   'instalacion', 12000.00, NULL, 'servicio',
   'https://images.pexels.com/photos/9875447/pexels-photo-9875447.jpeg?auto=compress&cs=tinysrgb&w=600', 999),

  ('ACC-CABLE', 'Kit de cableado solar 20 m',
   'Cable fotovoltaico 6 mm2 con conectores MC4, resistente a rayos UV.',
   'accesorio', 1850.00, NULL, 'kit',
   'https://images.pexels.com/photos/1108572/pexels-photo-1108572.jpeg?auto=compress&cs=tinysrgb&w=600', 60);

-- ------------------------------------------------------------
--  Pedidos de ejemplo, para que la aplicacion no arranque vacia
--  y se puedan ver los distintos estados del proceso.
-- ------------------------------------------------------------

-- Pedido 1: aprobado y ya con fecha de instalacion.
INSERT INTO pedidos
  (folio, usuario_id, estado, direccion_instalacion, ciudad, telefono_contacto,
   notas_cliente, subtotal, iva, total, fecha_visita, fecha_instalacion,
   notas_admin, revisado_por)
VALUES
  ('SOL-2026-0001', 2, 'agendado', 'Av. Universidad 123, Durango', 'Durango',
   '618-200-1111', 'El techo es de lamina, orientado al sur.',
   43150.00, 6904.00, 50054.00, '2026-09-24', '2026-10-02',
   'Techo apto. Se requiere refuerzo en dos puntos de anclaje.', 1);

INSERT INTO pedido_detalle (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad) VALUES
  (1, 1, 'Panel monocristalino 550 W', 4850.00, 6),
  (1, 3, 'Estructura de montaje para 4 paneles', 2750.00, 2),
  (1, 9, 'Instalacion residencial', 12000.00, 1);

INSERT INTO pedido_historial (pedido_id, estado, comentario, usuario_id) VALUES
  (1, 'solicitado', 'Solicitud enviada por el cliente.', 2),
  (1, 'en_revision', 'Asignada a revision tecnica.', 1),
  (1, 'aprobado', 'Proyecto aprobado. Visita tecnica el 24/09.', 1),
  (1, 'agendado', 'Instalacion programada para el 02/10.', 1);

-- Pedido 2: recien solicitado, esperando que el administrador lo revise.
INSERT INTO pedidos
  (folio, usuario_id, estado, direccion_instalacion, ciudad, telefono_contacto,
   notas_cliente, subtotal, iva, total)
VALUES
  ('SOL-2026-0002', 3, 'solicitado', 'Calle Pino 45, Durango', 'Durango',
   '618-300-2222', 'Quiero respaldo para cuando se va la luz.',
   91400.00, 14624.00, 106024.00);

INSERT INTO pedido_detalle (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad) VALUES
  (2, 2, 'Panel monocristalino 450 W', 3990.00, 4),
  (2, 5, 'Bateria de litio 5 kWh', 32500.00, 1),
  (2, 7, 'Inversor hibrido 5 kW', 24800.00, 1),
  (2, 9, 'Instalacion residencial', 12000.00, 1);

INSERT INTO pedido_historial (pedido_id, estado, comentario, usuario_id) VALUES
  (2, 'solicitado', 'Solicitud enviada por el cliente.', 3);

-- Pedido 3: rechazado, para mostrar ese camino del proceso.
INSERT INTO pedidos
  (folio, usuario_id, estado, direccion_instalacion, ciudad, telefono_contacto,
   subtotal, iva, total, motivo_rechazo, revisado_por)
VALUES
  ('SOL-2026-0003', 2, 'rechazado', 'Bodega s/n, carretera a Mezquital', 'Durango',
   '618-200-1111', 7980.00, 1276.80, 9256.80,
   'El inmueble no cuenta con servicio de CFE a nombre del solicitante, requisito para el tramite de interconexion.',
   1);

INSERT INTO pedido_detalle (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad) VALUES
  (3, 2, 'Panel monocristalino 450 W', 3990.00, 2);

INSERT INTO pedido_historial (pedido_id, estado, comentario, usuario_id) VALUES
  (3, 'solicitado', 'Solicitud enviada por el cliente.', 2),
  (3, 'en_revision', 'Revisando documentacion.', 1),
  (3, 'rechazado', 'Falta contrato de CFE a nombre del solicitante.', 1);

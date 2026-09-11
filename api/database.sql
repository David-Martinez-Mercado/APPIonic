-- ============================================================
--  Base de datos para la API de usuarios
--  Importar desde phpMyAdmin:  Importar > Elegir archivo > Continuar
-- ============================================================

CREATE DATABASE IF NOT EXISTS app_usuarios
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE app_usuarios;

DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  email      VARCHAR(150) NOT NULL UNIQUE,
  full_name  VARCHAR(150) NOT NULL,
  password   VARCHAR(255) NOT NULL,          -- hash bcrypt (password_hash)
  activo     TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuarios de prueba. La contrasena de ambos es: 123456
-- (hash generado con password_hash('123456', PASSWORD_DEFAULT))
INSERT INTO usuarios (username, email, full_name, password) VALUES
  ('admin', 'admin@demo.com', 'Administrador', '$2y$10$D2Bsd2frb82hFv8uKOhzwOdeA5aYT6Rd4BEGOSOTuqeJ6bhzRdSxm'),
  ('dmartinez', 'd.martinez.isw@unipolidgo.edu.mx', 'D. Martinez', '$2y$10$D2Bsd2frb82hFv8uKOhzwOdeA5aYT6Rd4BEGOSOTuqeJ6bhzRdSxm');

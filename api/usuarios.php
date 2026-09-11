<?php
/**
 * API CRUD de usuarios  -  archivo unico
 * Ubicacion: C:\xampp\htdocs\api\usuarios.php
 * URL base:  http://localhost/api/usuarios.php
 *
 * Metodos soportados:
 *   GET     /usuarios.php              -> lista todos
 *   GET     /usuarios.php?id=1         -> obtiene uno
 *   POST    /usuarios.php              -> crea usuario
 *   POST    /usuarios.php?accion=login -> login
 *   PUT     /usuarios.php?id=1         -> reemplaza TODOS los campos
 *   PATCH   /usuarios.php?id=1         -> actualiza SOLO los campos enviados
 *   DELETE  /usuarios.php?id=1         -> elimina usuario
 */

// ------------------------------------------------------------
//  CORS  (necesario para que Ionic/Angular pueda llamar la API)
// ------------------------------------------------------------
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 3600');
header('Content-Type: application/json; charset=utf-8');

// El navegador manda un preflight OPTIONS antes de PUT/PATCH/DELETE.
// Hay que responderlo con 204 y cortar, sin tocar la base de datos.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); // 204 No Content
    exit;
}

// ------------------------------------------------------------
//  Configuracion de la base de datos (XAMPP por defecto)
// ------------------------------------------------------------
const DB_HOST = 'localhost';
const DB_NAME = 'app_usuarios';
const DB_USER = 'root';
const DB_PASS = '';          // XAMPP viene sin contrasena para root

// ------------------------------------------------------------
//  Helpers de respuesta
// ------------------------------------------------------------
function responder(int $codigo, array $datos): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function exito(int $codigo, $datos, string $mensaje = 'OK'): void
{
    responder($codigo, [
        'ok'      => true,
        'mensaje' => $mensaje,
        'datos'   => $datos,
    ]);
}

function error(int $codigo, string $mensaje, $detalles = null): void
{
    $cuerpo = [
        'ok'     => false,
        'error'  => $mensaje,
        'codigo' => $codigo,
    ];
    if ($detalles !== null) {
        $cuerpo['detalles'] = $detalles;
    }
    responder($codigo, $cuerpo);
}

/** Lee el JSON del body. Devuelve [] si viene vacio. */
function cuerpoJson(): array
{
    $raw = file_get_contents('php://input');
    if (trim($raw) === '') {
        return [];
    }
    $datos = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error(400, 'El cuerpo de la peticion no es JSON valido.', json_last_error_msg());
    }
    return is_array($datos) ? $datos : [];
}

/** Quita el hash antes de mandar el usuario al cliente. */
function limpiar(array $fila): array
{
    unset($fila['password']);
    $fila['id']     = (int) $fila['id'];
    $fila['activo'] = (int) $fila['activo'];
    return $fila;
}

function validarEmail(string $email): bool
{
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

// ------------------------------------------------------------
//  Conexion
// ------------------------------------------------------------
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    // 503: el servicio no esta disponible porque MySQL no responde
    error(503, 'No se pudo conectar con la base de datos. Verifica que MySQL este iniciado en XAMPP.', $e->getMessage());
}

$metodo = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? filter_var($_GET['id'], FILTER_VALIDATE_INT) : null;
$accion = $_GET['accion'] ?? null;

if (isset($_GET['id']) && $id === false) {
    error(400, 'El parametro id debe ser un numero entero.');
}

try {
    switch ($metodo) {

        // ====================================================
        //  GET - listar todos u obtener uno
        // ====================================================
        case 'GET':
            if ($id !== null) {
                $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
                $stmt->execute([$id]);
                $usuario = $stmt->fetch();

                if (!$usuario) {
                    error(404, "No existe un usuario con id $id.");
                }
                exito(200, limpiar($usuario));
            }

            $usuarios = $pdo->query('SELECT * FROM usuarios ORDER BY id')->fetchAll();
            exito(200, array_map('limpiar', $usuarios), count($usuarios) . ' usuario(s) encontrado(s).');
            break;

        // ====================================================
        //  POST - crear usuario  /  login
        // ====================================================
        case 'POST':
            $datos = cuerpoJson();

            // ---------- LOGIN ----------
            if ($accion === 'login') {
                if (empty($datos['username']) || empty($datos['password'])) {
                    error(400, 'Usuario y contrasena son obligatorios.');
                }

                // Permite entrar con username o con email
                $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE username = ? OR email = ?');
                $stmt->execute([$datos['username'], $datos['username']]);
                $usuario = $stmt->fetch();

                // 401: credenciales invalidas. Mismo mensaje si no existe el
                // usuario o si la contrasena es incorrecta, para no revelar
                // cuales usuarios existen.
                if (!$usuario || !password_verify($datos['password'], $usuario['password'])) {
                    error(401, 'Usuario o contrasena incorrectos.');
                }

                if ((int) $usuario['activo'] !== 1) {
                    error(403, 'La cuenta esta desactivada.');
                }

                exito(200, limpiar($usuario), 'Sesion iniciada correctamente.');
            }

            // ---------- CREAR ----------
            $requeridos = ['username', 'email', 'full_name', 'password'];
            $faltantes  = [];
            foreach ($requeridos as $campo) {
                if (empty($datos[$campo])) {
                    $faltantes[] = $campo;
                }
            }
            if ($faltantes) {
                error(400, 'Faltan campos obligatorios.', $faltantes);
            }

            if (!validarEmail($datos['email'])) {
                error(422, 'El formato del email no es valido.');
            }
            if (strlen($datos['password']) < 6) {
                error(422, 'La contrasena debe tener al menos 6 caracteres.');
            }

            // 409: conflicto, el username o email ya estan tomados
            $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE username = ? OR email = ?');
            $stmt->execute([$datos['username'], $datos['email']]);
            if ($stmt->fetch()) {
                error(409, 'El username o el email ya estan registrados.');
            }

            $stmt = $pdo->prepare(
                'INSERT INTO usuarios (username, email, full_name, password) VALUES (?, ?, ?, ?)'
            );
            $stmt->execute([
                $datos['username'],
                $datos['email'],
                $datos['full_name'],
                password_hash($datos['password'], PASSWORD_DEFAULT),
            ]);

            $nuevoId = (int) $pdo->lastInsertId();
            $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
            $stmt->execute([$nuevoId]);

            // 201: recurso creado
            exito(201, limpiar($stmt->fetch()), 'Usuario creado correctamente.');
            break;

        // ====================================================
        //  PUT - reemplaza TODOS los campos (los exige todos)
        // ====================================================
        case 'PUT':
            if ($id === null) {
                error(400, 'Debes indicar el id: usuarios.php?id=1');
            }

            $datos = cuerpoJson();

            $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                error(404, "No existe un usuario con id $id.");
            }

            // La diferencia con PATCH: aqui TODOS los campos son obligatorios
            $requeridos = ['username', 'email', 'full_name', 'password'];
            $faltantes  = [];
            foreach ($requeridos as $campo) {
                if (empty($datos[$campo])) {
                    $faltantes[] = $campo;
                }
            }
            if ($faltantes) {
                error(400, 'PUT reemplaza el recurso completo, por lo que todos los campos son obligatorios. Usa PATCH si solo quieres cambiar algunos.', $faltantes);
            }

            if (!validarEmail($datos['email'])) {
                error(422, 'El formato del email no es valido.');
            }
            if (strlen($datos['password']) < 6) {
                error(422, 'La contrasena debe tener al menos 6 caracteres.');
            }

            // Que no choque con OTRO usuario distinto de este
            $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE (username = ? OR email = ?) AND id <> ?');
            $stmt->execute([$datos['username'], $datos['email'], $id]);
            if ($stmt->fetch()) {
                error(409, 'El username o el email ya pertenecen a otro usuario.');
            }

            $stmt = $pdo->prepare(
                'UPDATE usuarios SET username = ?, email = ?, full_name = ?, password = ?, activo = ? WHERE id = ?'
            );
            $stmt->execute([
                $datos['username'],
                $datos['email'],
                $datos['full_name'],
                password_hash($datos['password'], PASSWORD_DEFAULT),
                isset($datos['activo']) ? (int) (bool) $datos['activo'] : 1,
                $id,
            ]);

            $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
            $stmt->execute([$id]);
            exito(200, limpiar($stmt->fetch()), 'Usuario reemplazado correctamente.');
            break;

        // ====================================================
        //  PATCH - actualiza SOLO los campos enviados
        // ====================================================
        case 'PATCH':
            if ($id === null) {
                error(400, 'Debes indicar el id: usuarios.php?id=1');
            }

            $datos = cuerpoJson();

            if (!$datos) {
                error(400, 'No enviaste ningun campo para actualizar.');
            }

            $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                error(404, "No existe un usuario con id $id.");
            }

            // Se arma el UPDATE dinamicamente con lo que si llego
            $permitidos = ['username', 'email', 'full_name', 'password', 'activo'];
            $sets       = [];
            $valores    = [];

            foreach ($permitidos as $campo) {
                if (!array_key_exists($campo, $datos)) {
                    continue;   // no se envio, no se toca
                }

                $valor = $datos[$campo];

                switch ($campo) {
                    case 'email':
                        if (!validarEmail($valor)) {
                            error(422, 'El formato del email no es valido.');
                        }
                        break;
                    case 'password':
                        if (strlen($valor) < 6) {
                            error(422, 'La contrasena debe tener al menos 6 caracteres.');
                        }
                        $valor = password_hash($valor, PASSWORD_DEFAULT);
                        break;
                    case 'activo':
                        $valor = (int) (bool) $valor;
                        break;
                    default:
                        if (trim((string) $valor) === '') {
                            error(422, "El campo $campo no puede ir vacio.");
                        }
                }

                $sets[]    = "$campo = ?";
                $valores[] = $valor;
            }

            if (!$sets) {
                error(422, 'Ninguno de los campos enviados se puede actualizar.', ['permitidos' => $permitidos]);
            }

            // Choque con otro usuario solo si se cambia username o email
            if (isset($datos['username']) || isset($datos['email'])) {
                $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE (username = ? OR email = ?) AND id <> ?');
                $stmt->execute([$datos['username'] ?? '', $datos['email'] ?? '', $id]);
                if ($stmt->fetch()) {
                    error(409, 'El username o el email ya pertenecen a otro usuario.');
                }
            }

            $valores[] = $id;
            $stmt = $pdo->prepare('UPDATE usuarios SET ' . implode(', ', $sets) . ' WHERE id = ?');
            $stmt->execute($valores);

            $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
            $stmt->execute([$id]);
            exito(200, limpiar($stmt->fetch()), 'Usuario actualizado correctamente.');
            break;

        // ====================================================
        //  DELETE - eliminar
        // ====================================================
        case 'DELETE':
            if ($id === null) {
                error(400, 'Debes indicar el id: usuarios.php?id=1');
            }

            $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
            $stmt->execute([$id]);
            $usuario = $stmt->fetch();

            if (!$usuario) {
                error(404, "No existe un usuario con id $id.");
            }

            $stmt = $pdo->prepare('DELETE FROM usuarios WHERE id = ?');
            $stmt->execute([$id]);

            exito(200, limpiar($usuario), 'Usuario eliminado correctamente.');
            break;

        // ====================================================
        //  Metodo no permitido
        // ====================================================
        default:
            // 405: el metodo no aplica. Se debe informar cuales si.
            header('Allow: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            error(405, "El metodo $metodo no esta permitido en este endpoint.");
    }

} catch (PDOException $e) {
    // 500: cualquier fallo inesperado de la base de datos
    error(500, 'Error interno del servidor al consultar la base de datos.', $e->getMessage());
}

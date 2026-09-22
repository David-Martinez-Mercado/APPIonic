<?php
/**
 * API CRUD del catalogo de productos  -  archivo unico
 * Ubicacion: C:\xampp\htdocs\api\productos.php
 * URL base:  http://localhost/api/productos.php
 *
 * Metodos soportados:
 *   GET     /productos.php                      -> lista todos los activos
 *   GET     /productos.php?todos=1              -> incluye los desactivados
 *   GET     /productos.php?id=1                 -> obtiene uno
 *   GET     /productos.php?categoria=panel      -> filtra por categoria
 *   GET     /productos.php?buscar=litio         -> busca por nombre
 *   POST    /productos.php                      -> crea producto
 *   PUT     /productos.php?id=1                 -> reemplaza TODOS los campos
 *   PATCH   /productos.php?id=1                 -> actualiza SOLO lo enviado
 *   DELETE  /productos.php?id=1                 -> baja logica (activo = 0)
 *
 * Sigue las mismas convenciones que usuarios.php: misma envoltura de
 * respuesta, mismos codigos HTTP y mismo manejo de errores.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 3600');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const DB_HOST = 'localhost';
const DB_NAME = 'app_usuarios';
const DB_USER = 'root';
const DB_PASS = '';

/** Categorias validas. Debe coincidir con el ENUM de la tabla. */
const CATEGORIAS = ['panel', 'estructura', 'bateria', 'inversor', 'instalacion', 'accesorio'];

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
    responder($codigo, ['ok' => true, 'mensaje' => $mensaje, 'datos' => $datos]);
}

function error(int $codigo, string $mensaje, $detalles = null): void
{
    $cuerpo = ['ok' => false, 'error' => $mensaje, 'codigo' => $codigo];
    if ($detalles !== null) {
        $cuerpo['detalles'] = $detalles;
    }
    responder($codigo, $cuerpo);
}

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

/**
 * Convierte los tipos que MySQL devuelve como texto.
 *
 * PDO entrega todo como string; sin esto, el precio llegaria a la
 * aplicacion como "4850.00" y las comparaciones numericas en
 * TypeScript fallarian de formas silenciosas.
 */
function normalizar(array $fila): array
{
    $fila['id']         = (int) $fila['id'];
    $fila['precio']     = (float) $fila['precio'];
    $fila['stock']      = (int) $fila['stock'];
    $fila['activo']     = (int) $fila['activo'];
    $fila['potencia_w'] = $fila['potencia_w'] === null ? null : (int) $fila['potencia_w'];
    return $fila;
}

function validarCategoria(string $categoria): bool
{
    return in_array($categoria, CATEGORIAS, true);
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
    error(503, 'No se pudo conectar con la base de datos. Verifica que MySQL este iniciado en XAMPP.', $e->getMessage());
}

$metodo    = $_SERVER['REQUEST_METHOD'];
$id        = isset($_GET['id']) ? filter_var($_GET['id'], FILTER_VALIDATE_INT) : null;
$categoria = $_GET['categoria'] ?? null;
$buscar    = $_GET['buscar'] ?? null;
$todos     = isset($_GET['todos']);

if (isset($_GET['id']) && $id === false) {
    error(400, 'El parametro id debe ser un numero entero.');
}

try {
    switch ($metodo) {

        // ====================================================
        //  GET
        // ====================================================
        case 'GET':
            if ($id !== null) {
                $stmt = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
                $stmt->execute([$id]);
                $producto = $stmt->fetch();

                if (!$producto) {
                    error(404, "No existe un producto con id $id.");
                }
                exito(200, normalizar($producto));
            }

            // Se arma la consulta por partes para combinar los filtros
            // sin concatenar valores: todo va con marcadores.
            $sql    = 'SELECT * FROM productos WHERE 1 = 1';
            $params = [];

            if (!$todos) {
                $sql .= ' AND activo = 1';
            }

            if ($categoria !== null && $categoria !== '') {
                if (!validarCategoria($categoria)) {
                    error(422, 'Categoria no valida.', CATEGORIAS);
                }
                $sql     .= ' AND categoria = ?';
                $params[] = $categoria;
            }

            if ($buscar !== null && trim($buscar) !== '') {
                $sql     .= ' AND (nombre LIKE ? OR descripcion LIKE ? OR sku LIKE ?)';
                $comodin  = '%' . trim($buscar) . '%';
                $params[] = $comodin;
                $params[] = $comodin;
                $params[] = $comodin;
            }

            // Se ordena por categoria para que la vista pueda agrupar
            // sin volver a ordenar del lado del cliente.
            $sql .= ' ORDER BY FIELD(categoria, "panel","estructura","bateria","inversor","instalacion","accesorio"), precio';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $productos = $stmt->fetchAll();

            exito(200, array_map('normalizar', $productos),
                  count($productos) . ' producto(s) encontrado(s).');
            break;

        // ====================================================
        //  POST - crear
        // ====================================================
        case 'POST':
            $datos = cuerpoJson();

            $requeridos = ['sku', 'nombre', 'categoria', 'precio'];
            $faltantes  = [];
            foreach ($requeridos as $campo) {
                // Se usa isset y no empty: un precio de 0 es valido
                // y empty("0") devuelve true.
                if (!isset($datos[$campo]) || trim((string) $datos[$campo]) === '') {
                    $faltantes[] = $campo;
                }
            }
            if ($faltantes) {
                error(400, 'Faltan campos obligatorios.', $faltantes);
            }

            if (!validarCategoria($datos['categoria'])) {
                error(422, 'Categoria no valida.', CATEGORIAS);
            }
            if (!is_numeric($datos['precio']) || (float) $datos['precio'] < 0) {
                error(422, 'El precio debe ser un numero mayor o igual a cero.');
            }

            $stmt = $pdo->prepare('SELECT id FROM productos WHERE sku = ?');
            $stmt->execute([$datos['sku']]);
            if ($stmt->fetch()) {
                error(409, 'Ya existe un producto con ese SKU.');
            }

            $stmt = $pdo->prepare(
                'INSERT INTO productos
                   (sku, nombre, descripcion, categoria, precio, potencia_w, unidad, imagen_url, stock)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                trim($datos['sku']),
                trim($datos['nombre']),
                $datos['descripcion'] ?? null,
                $datos['categoria'],
                (float) $datos['precio'],
                isset($datos['potencia_w']) && $datos['potencia_w'] !== '' ? (int) $datos['potencia_w'] : null,
                $datos['unidad'] ?? 'pieza',
                $datos['imagen_url'] ?? null,
                isset($datos['stock']) ? (int) $datos['stock'] : 0,
            ]);

            $nuevo = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
            $nuevo->execute([(int) $pdo->lastInsertId()]);

            exito(201, normalizar($nuevo->fetch()), 'Producto creado correctamente.');
            break;

        // ====================================================
        //  PUT - reemplazar el registro completo
        // ====================================================
        case 'PUT':
            if ($id === null) {
                error(400, 'Falta el parametro id.');
            }
            $datos = cuerpoJson();

            $stmt = $pdo->prepare('SELECT id FROM productos WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                error(404, "No existe un producto con id $id.");
            }

            $requeridos = ['sku', 'nombre', 'categoria', 'precio'];
            $faltantes  = [];
            foreach ($requeridos as $campo) {
                if (!isset($datos[$campo]) || trim((string) $datos[$campo]) === '') {
                    $faltantes[] = $campo;
                }
            }
            if ($faltantes) {
                error(400, 'PUT reemplaza el registro completo: faltan campos.', $faltantes);
            }
            if (!validarCategoria($datos['categoria'])) {
                error(422, 'Categoria no valida.', CATEGORIAS);
            }

            // El SKU es unico: hay que dejar fuera al propio registro.
            $stmt = $pdo->prepare('SELECT id FROM productos WHERE sku = ? AND id <> ?');
            $stmt->execute([$datos['sku'], $id]);
            if ($stmt->fetch()) {
                error(409, 'Ya existe otro producto con ese SKU.');
            }

            $stmt = $pdo->prepare(
                'UPDATE productos SET
                   sku = ?, nombre = ?, descripcion = ?, categoria = ?, precio = ?,
                   potencia_w = ?, unidad = ?, imagen_url = ?, stock = ?, activo = ?
                 WHERE id = ?'
            );
            $stmt->execute([
                trim($datos['sku']),
                trim($datos['nombre']),
                $datos['descripcion'] ?? null,
                $datos['categoria'],
                (float) $datos['precio'],
                isset($datos['potencia_w']) && $datos['potencia_w'] !== '' ? (int) $datos['potencia_w'] : null,
                $datos['unidad'] ?? 'pieza',
                $datos['imagen_url'] ?? null,
                isset($datos['stock']) ? (int) $datos['stock'] : 0,
                isset($datos['activo']) ? (int) $datos['activo'] : 1,
                $id,
            ]);

            $act = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
            $act->execute([$id]);
            exito(200, normalizar($act->fetch()), 'Producto reemplazado correctamente.');
            break;

        // ====================================================
        //  PATCH - actualizar solo lo enviado
        // ====================================================
        case 'PATCH':
            if ($id === null) {
                error(400, 'Falta el parametro id.');
            }
            $datos = cuerpoJson();

            $stmt = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                error(404, "No existe un producto con id $id.");
            }

            $permitidos = ['sku', 'nombre', 'descripcion', 'categoria', 'precio',
                           'potencia_w', 'unidad', 'imagen_url', 'stock', 'activo'];
            $sets   = [];
            $valores = [];

            foreach ($datos as $campo => $valor) {
                if (!in_array($campo, $permitidos, true)) {
                    continue;   // se ignora en silencio lo que no se puede editar
                }

                switch ($campo) {
                    case 'categoria':
                        if (!validarCategoria($valor)) {
                            error(422, 'Categoria no valida.', CATEGORIAS);
                        }
                        break;

                    case 'precio':
                        if (!is_numeric($valor) || (float) $valor < 0) {
                            error(422, 'El precio debe ser un numero mayor o igual a cero.');
                        }
                        $valor = (float) $valor;
                        break;

                    case 'stock':
                        if (!is_numeric($valor) || (int) $valor < 0) {
                            error(422, 'El stock no puede ser negativo.');
                        }
                        $valor = (int) $valor;
                        break;

                    case 'sku':
                        $dup = $pdo->prepare('SELECT id FROM productos WHERE sku = ? AND id <> ?');
                        $dup->execute([$valor, $id]);
                        if ($dup->fetch()) {
                            error(409, 'Ya existe otro producto con ese SKU.');
                        }
                        break;

                    case 'potencia_w':
                        $valor = ($valor === '' || $valor === null) ? null : (int) $valor;
                        break;

                    case 'activo':
                        $valor = (int) $valor;
                        break;
                }

                $sets[]    = "$campo = ?";
                $valores[] = $valor;
            }

            if (!$sets) {
                error(400, 'No se envio ningun campo valido para actualizar.', $permitidos);
            }

            $valores[] = $id;
            $pdo->prepare('UPDATE productos SET ' . implode(', ', $sets) . ' WHERE id = ?')
                ->execute($valores);

            $act = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
            $act->execute([$id]);
            exito(200, normalizar($act->fetch()), 'Producto actualizado correctamente.');
            break;

        // ====================================================
        //  DELETE - baja logica
        // ====================================================
        case 'DELETE':
            if ($id === null) {
                error(400, 'Falta el parametro id.');
            }

            $stmt = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
            $stmt->execute([$id]);
            $producto = $stmt->fetch();

            if (!$producto) {
                error(404, "No existe un producto con id $id.");
            }

            // Baja logica y no DELETE real: el producto puede estar
            // referenciado por pedidos historicos, y borrarlo dejaria
            // esos pedidos sin poder mostrarse.
            $pdo->prepare('UPDATE productos SET activo = 0 WHERE id = ?')->execute([$id]);

            $producto['activo'] = 0;
            exito(200, normalizar($producto), 'Producto dado de baja del catalogo.');
            break;

        default:
            error(405, "Metodo $metodo no permitido.");
    }
} catch (PDOException $e) {
    error(500, 'Error en la base de datos.', $e->getMessage());
}

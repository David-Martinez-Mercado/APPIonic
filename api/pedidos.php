<?php
/**
 * API de pedidos (solicitudes de proyecto solar)  -  archivo unico
 * Ubicacion: C:\xampp\htdocs\api\pedidos.php
 * URL base:  http://localhost/api/pedidos.php
 *
 * Metodos soportados:
 *   GET    /pedidos.php                    -> lista todos (vista de administrador)
 *   GET    /pedidos.php?usuario_id=2       -> solo los de ese cliente
 *   GET    /pedidos.php?estado=solicitado  -> filtra por estado
 *   GET    /pedidos.php?id=1               -> uno, con partidas e historial
 *   POST   /pedidos.php                    -> crea la solicitud desde el carrito
 *   PATCH  /pedidos.php?id=1&accion=estado -> cambia el estado (administrador)
 *   PATCH  /pedidos.php?id=1               -> edita fechas y notas
 *   DELETE /pedidos.php?id=1               -> cancela (no borra)
 *
 * A diferencia de productos.php, aqui casi nada es un CRUD plano: un
 * pedido nace de un carrito, avanza por estados con reglas y deja
 * bitacora de cada cambio.
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

/** IVA mexicano. Se aplica sobre el subtotal al crear la solicitud. */
const TASA_IVA = 0.16;

/**
 * Transiciones permitidas entre estados.
 *
 * Tenerlas aqui, y no repartidas en ifs, evita que el pedido salte
 * pasos (por ejemplo de 'solicitado' directo a 'completado') y deja
 * el proceso descrito en un solo lugar legible.
 */
const TRANSICIONES = [
    'solicitado'     => ['en_revision', 'rechazado', 'cancelado'],
    'en_revision'    => ['aprobado', 'rechazado', 'cancelado'],
    'aprobado'       => ['agendado', 'cancelado'],
    'agendado'       => ['en_instalacion', 'cancelado'],
    'en_instalacion' => ['completado'],
    'completado'     => [],   // estado final
    'rechazado'      => [],   // estado final
    'cancelado'      => [],   // estado final
];

/** Etiquetas legibles, para que la app no tenga que traducirlas. */
const ETIQUETAS = [
    'solicitado'     => 'Solicitado',
    'en_revision'    => 'En revision',
    'aprobado'       => 'Aprobado',
    'agendado'       => 'Agendado',
    'en_instalacion' => 'En instalacion',
    'completado'     => 'Completado',
    'rechazado'      => 'Rechazado',
    'cancelado'      => 'Cancelado',
];

/** Pasos del avance normal, para dibujar la barra de progreso. */
const FLUJO = ['solicitado', 'en_revision', 'aprobado', 'agendado', 'en_instalacion', 'completado'];

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
 * Convierte tipos y agrega los campos derivados que la vista necesita.
 *
 * El "paso" y el "progreso" se calculan aqui y no en el cliente para
 * que la aplicacion movil y cualquier otro consumidor muestren
 * exactamente lo mismo.
 */
function normalizarPedido(array $p): array
{
    $p['id']         = (int) $p['id'];
    $p['usuario_id'] = (int) $p['usuario_id'];
    $p['subtotal']   = (float) $p['subtotal'];
    $p['iva']        = (float) $p['iva'];
    $p['total']      = (float) $p['total'];
    $p['revisado_por'] = $p['revisado_por'] === null ? null : (int) $p['revisado_por'];

    $p['estado_etiqueta'] = ETIQUETAS[$p['estado']] ?? $p['estado'];

    $indice = array_search($p['estado'], FLUJO, true);
    if ($indice === false) {
        // rechazado o cancelado: el proceso se detuvo, no hay avance
        $p['paso']     = 0;
        $p['progreso'] = 0;
        $p['detenido'] = true;
    } else {
        $p['paso']     = $indice + 1;
        $p['progreso'] = (int) round((($indice + 1) / count(FLUJO)) * 100);
        $p['detenido'] = false;
    }

    $p['pasos_totales']   = count(FLUJO);
    $p['siguientes']      = TRANSICIONES[$p['estado']] ?? [];
    $p['es_final']        = empty(TRANSICIONES[$p['estado']]);

    return $p;
}

function normalizarDetalle(array $d): array
{
    $d['id']              = (int) $d['id'];
    $d['pedido_id']       = (int) $d['pedido_id'];
    $d['producto_id']     = (int) $d['producto_id'];
    $d['precio_unitario'] = (float) $d['precio_unitario'];
    $d['cantidad']        = (int) $d['cantidad'];
    $d['importe']         = (float) $d['importe'];
    return $d;
}

function normalizarHistorial(array $h): array
{
    $h['id']         = (int) $h['id'];
    $h['pedido_id']  = (int) $h['pedido_id'];
    $h['usuario_id'] = $h['usuario_id'] === null ? null : (int) $h['usuario_id'];
    $h['estado_etiqueta'] = ETIQUETAS[$h['estado']] ?? $h['estado'];
    return $h;
}

/** Genera el siguiente folio del anio: SOL-2026-0007. */
function siguienteFolio(PDO $pdo): string
{
    $anio = date('Y');
    $stmt = $pdo->prepare(
        "SELECT folio FROM pedidos WHERE folio LIKE ? ORDER BY id DESC LIMIT 1"
    );
    $stmt->execute(["SOL-$anio-%"]);
    $ultimo = $stmt->fetchColumn();

    $consecutivo = $ultimo ? ((int) substr($ultimo, -4)) + 1 : 1;
    return sprintf('SOL-%s-%04d', $anio, $consecutivo);
}

/** Deja constancia del cambio en la bitacora. */
function registrarHistorial(PDO $pdo, int $pedidoId, string $estado, ?string $comentario, ?int $usuarioId): void
{
    $pdo->prepare(
        'INSERT INTO pedido_historial (pedido_id, estado, comentario, usuario_id) VALUES (?, ?, ?, ?)'
    )->execute([$pedidoId, $estado, $comentario, $usuarioId]);
}

/** Carga un pedido completo: cabecera, partidas e historial. */
function pedidoCompleto(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT p.*, u.full_name AS cliente_nombre, u.email AS cliente_email,
                r.full_name AS revisor_nombre
           FROM pedidos p
           JOIN usuarios u ON u.id = p.usuario_id
           LEFT JOIN usuarios r ON r.id = p.revisado_por
          WHERE p.id = ?'
    );
    $stmt->execute([$id]);
    $pedido = $stmt->fetch();

    if (!$pedido) {
        return null;
    }

    $det = $pdo->prepare('SELECT * FROM pedido_detalle WHERE pedido_id = ? ORDER BY id');
    $det->execute([$id]);

    $hist = $pdo->prepare('SELECT * FROM pedido_historial WHERE pedido_id = ? ORDER BY creado_en, id');
    $hist->execute([$id]);

    $pedido = normalizarPedido($pedido);
    $pedido['detalle']   = array_map('normalizarDetalle', $det->fetchAll());
    $pedido['historial'] = array_map('normalizarHistorial', $hist->fetchAll());

    return $pedido;
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
$usuarioId = isset($_GET['usuario_id']) ? filter_var($_GET['usuario_id'], FILTER_VALIDATE_INT) : null;
$estado    = $_GET['estado'] ?? null;
$accion    = $_GET['accion'] ?? null;

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
                $pedido = pedidoCompleto($pdo, $id);
                if (!$pedido) {
                    error(404, "No existe un pedido con id $id.");
                }
                exito(200, $pedido);
            }

            $sql = 'SELECT p.*, u.full_name AS cliente_nombre, u.email AS cliente_email,
                           r.full_name AS revisor_nombre,
                           (SELECT COUNT(*) FROM pedido_detalle d WHERE d.pedido_id = p.id) AS partidas
                      FROM pedidos p
                      JOIN usuarios u ON u.id = p.usuario_id
                      LEFT JOIN usuarios r ON r.id = p.revisado_por
                     WHERE 1 = 1';
            $params = [];

            if ($usuarioId) {
                $sql     .= ' AND p.usuario_id = ?';
                $params[] = $usuarioId;
            }
            if ($estado !== null && $estado !== '') {
                if (!isset(TRANSICIONES[$estado])) {
                    error(422, 'Estado no valido.', array_keys(TRANSICIONES));
                }
                $sql     .= ' AND p.estado = ?';
                $params[] = $estado;
            }

            // Los mas recientes primero: es lo que interesa en ambas vistas.
            $sql .= ' ORDER BY p.creado_en DESC, p.id DESC';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            $pedidos = array_map(function (array $p): array {
                $p = normalizarPedido($p);
                $p['partidas'] = (int) $p['partidas'];
                return $p;
            }, $stmt->fetchAll());

            exito(200, $pedidos, count($pedidos) . ' pedido(s) encontrado(s).');
            break;

        // ====================================================
        //  POST - crear la solicitud desde el carrito
        // ====================================================
        case 'POST':
            $datos = cuerpoJson();

            if (empty($datos['usuario_id'])) {
                error(400, 'Falta el usuario que solicita.');
            }
            if (empty($datos['direccion_instalacion'])) {
                error(400, 'La direccion de instalacion es obligatoria.');
            }
            if (empty($datos['items']) || !is_array($datos['items'])) {
                error(400, 'La solicitud no tiene productos.');
            }

            $usr = $pdo->prepare('SELECT id FROM usuarios WHERE id = ? AND activo = 1');
            $usr->execute([(int) $datos['usuario_id']]);
            if (!$usr->fetch()) {
                error(404, 'El usuario que solicita no existe o esta desactivado.');
            }

            // Todo o nada: si una partida falla, no debe quedar un
            // pedido a medias en la base de datos.
            $pdo->beginTransaction();

            try {
                // El precio se toma del catalogo, NUNCA del cliente: si
                // se confiara en lo que manda la app, cualquiera podria
                // pedir paneles a un peso.
                $partidas = [];
                $subtotal = 0.0;

                foreach ($datos['items'] as $item) {
                    if (empty($item['producto_id']) || empty($item['cantidad'])) {
                        throw new RuntimeException('Cada partida necesita producto_id y cantidad.');
                    }

                    $cantidad = (int) $item['cantidad'];
                    if ($cantidad < 1) {
                        throw new RuntimeException('La cantidad debe ser mayor que cero.');
                    }

                    $prod = $pdo->prepare('SELECT * FROM productos WHERE id = ? AND activo = 1');
                    $prod->execute([(int) $item['producto_id']]);
                    $producto = $prod->fetch();

                    if (!$producto) {
                        throw new RuntimeException('El producto ' . $item['producto_id'] . ' no esta disponible.');
                    }
                    if ((int) $producto['stock'] < $cantidad) {
                        throw new RuntimeException(
                            'Stock insuficiente de "' . $producto['nombre'] . '". Disponibles: ' . $producto['stock'] . '.'
                        );
                    }

                    $importe   = (float) $producto['precio'] * $cantidad;
                    $subtotal += $importe;

                    $partidas[] = [
                        'producto_id'     => (int) $producto['id'],
                        'nombre_producto' => $producto['nombre'],
                        'precio_unitario' => (float) $producto['precio'],
                        'cantidad'        => $cantidad,
                    ];
                }

                $iva   = round($subtotal * TASA_IVA, 2);
                $total = round($subtotal + $iva, 2);
                $folio = siguienteFolio($pdo);

                $stmt = $pdo->prepare(
                    'INSERT INTO pedidos
                       (folio, usuario_id, estado, direccion_instalacion, ciudad,
                        telefono_contacto, notas_cliente, subtotal, iva, total)
                     VALUES (?, ?, "solicitado", ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([
                    $folio,
                    (int) $datos['usuario_id'],
                    trim($datos['direccion_instalacion']),
                    $datos['ciudad'] ?? null,
                    $datos['telefono_contacto'] ?? null,
                    $datos['notas_cliente'] ?? null,
                    $subtotal,
                    $iva,
                    $total,
                ]);

                $pedidoId = (int) $pdo->lastInsertId();

                $insDet = $pdo->prepare(
                    'INSERT INTO pedido_detalle
                       (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad)
                     VALUES (?, ?, ?, ?, ?)'
                );
                $bajaStock = $pdo->prepare('UPDATE productos SET stock = stock - ? WHERE id = ?');

                foreach ($partidas as $p) {
                    $insDet->execute([
                        $pedidoId, $p['producto_id'], $p['nombre_producto'],
                        $p['precio_unitario'], $p['cantidad'],
                    ]);
                    // Se aparta el material desde que se solicita, para no
                    // comprometer el mismo stock con dos clientes.
                    $bajaStock->execute([$p['cantidad'], $p['producto_id']]);
                }

                registrarHistorial($pdo, $pedidoId, 'solicitado',
                    'Solicitud enviada por el cliente.', (int) $datos['usuario_id']);

                $pdo->commit();

                exito(201, pedidoCompleto($pdo, $pedidoId),
                      "Solicitud $folio registrada correctamente.");

            } catch (RuntimeException $e) {
                $pdo->rollBack();
                error(422, $e->getMessage());
            } catch (PDOException $e) {
                $pdo->rollBack();
                throw $e;
            }
            break;

        // ====================================================
        //  PATCH - cambio de estado  /  edicion de fechas y notas
        // ====================================================
        case 'PATCH':
            if ($id === null) {
                error(400, 'Falta el parametro id.');
            }
            $datos = cuerpoJson();

            $stmt = $pdo->prepare('SELECT * FROM pedidos WHERE id = ?');
            $stmt->execute([$id]);
            $pedido = $stmt->fetch();

            if (!$pedido) {
                error(404, "No existe un pedido con id $id.");
            }

            // ---------- Cambio de estado ----------
            if ($accion === 'estado') {
                if (empty($datos['estado'])) {
                    error(400, 'Falta el estado destino.');
                }

                $destino = $datos['estado'];
                $actual  = $pedido['estado'];

                if (!isset(TRANSICIONES[$destino])) {
                    error(422, 'Estado no valido.', array_keys(TRANSICIONES));
                }
                if (!in_array($destino, TRANSICIONES[$actual], true)) {
                    error(409,
                        'No se puede pasar de "' . ETIQUETAS[$actual] . '" a "' . ETIQUETAS[$destino] . '".',
                        ['estado_actual' => $actual, 'permitidos' => TRANSICIONES[$actual]]);
                }

                // Rechazar sin explicar por que deja al cliente sin
                // saber que corregir, asi que el motivo es obligatorio.
                if ($destino === 'rechazado' && empty($datos['motivo_rechazo'])) {
                    error(422, 'Para rechazar una solicitud hay que indicar el motivo.');
                }
                if ($destino === 'agendado' && empty($datos['fecha_instalacion']) && empty($pedido['fecha_instalacion'])) {
                    error(422, 'Para agendar hay que fijar la fecha de instalacion.');
                }

                $sets    = ['estado = ?'];
                $valores = [$destino];

                foreach (['fecha_visita', 'fecha_instalacion', 'notas_admin', 'motivo_rechazo'] as $campo) {
                    if (isset($datos[$campo]) && $datos[$campo] !== '') {
                        $sets[]    = "$campo = ?";
                        $valores[] = $datos[$campo];
                    }
                }
                if (!empty($datos['revisado_por'])) {
                    $sets[]    = 'revisado_por = ?';
                    $valores[] = (int) $datos['revisado_por'];
                }

                $valores[] = $id;
                $pdo->prepare('UPDATE pedidos SET ' . implode(', ', $sets) . ' WHERE id = ?')
                    ->execute($valores);

                // Si se cancela o rechaza, el material apartado vuelve
                // al catalogo: no tiene sentido retenerlo.
                if (in_array($destino, ['rechazado', 'cancelado'], true)) {
                    $pdo->prepare(
                        'UPDATE productos p
                           JOIN pedido_detalle d ON d.producto_id = p.id
                            SET p.stock = p.stock + d.cantidad
                          WHERE d.pedido_id = ?'
                    )->execute([$id]);
                }

                $comentario = $datos['comentario']
                    ?? $datos['motivo_rechazo']
                    ?? $datos['notas_admin']
                    ?? null;

                registrarHistorial($pdo, $id, $destino, $comentario,
                    isset($datos['revisado_por']) ? (int) $datos['revisado_por'] : null);

                exito(200, pedidoCompleto($pdo, $id),
                      'Pedido actualizado a "' . ETIQUETAS[$destino] . '".');
            }

            // ---------- Edicion de campos sueltos ----------
            $permitidos = ['fecha_visita', 'fecha_instalacion', 'notas_admin',
                           'direccion_instalacion', 'ciudad', 'telefono_contacto',
                           'notas_cliente', 'revisado_por'];
            $sets    = [];
            $valores = [];

            foreach ($datos as $campo => $valor) {
                if (!in_array($campo, $permitidos, true)) {
                    continue;
                }
                $sets[]    = "$campo = ?";
                $valores[] = ($valor === '' ? null : $valor);
            }

            if (!$sets) {
                error(400, 'No se envio ningun campo valido para actualizar.', $permitidos);
            }

            $valores[] = $id;
            $pdo->prepare('UPDATE pedidos SET ' . implode(', ', $sets) . ' WHERE id = ?')
                ->execute($valores);

            exito(200, pedidoCompleto($pdo, $id), 'Pedido actualizado correctamente.');
            break;

        // ====================================================
        //  DELETE - cancelar (nunca se borra el historico)
        // ====================================================
        case 'DELETE':
            if ($id === null) {
                error(400, 'Falta el parametro id.');
            }

            $stmt = $pdo->prepare('SELECT * FROM pedidos WHERE id = ?');
            $stmt->execute([$id]);
            $pedido = $stmt->fetch();

            if (!$pedido) {
                error(404, "No existe un pedido con id $id.");
            }
            if (!in_array('cancelado', TRANSICIONES[$pedido['estado']], true)) {
                error(409, 'Un pedido en estado "' . ETIQUETAS[$pedido['estado']] . '" ya no se puede cancelar.');
            }

            $pdo->prepare('UPDATE pedidos SET estado = "cancelado" WHERE id = ?')->execute([$id]);
            $pdo->prepare(
                'UPDATE productos p
                   JOIN pedido_detalle d ON d.producto_id = p.id
                    SET p.stock = p.stock + d.cantidad
                  WHERE d.pedido_id = ?'
            )->execute([$id]);

            registrarHistorial($pdo, $id, 'cancelado', 'Solicitud cancelada.', null);

            exito(200, pedidoCompleto($pdo, $id), 'Solicitud cancelada.');
            break;

        default:
            error(405, "Metodo $metodo no permitido.");
    }
} catch (PDOException $e) {
    error(500, 'Error en la base de datos.', $e->getMessage());
}

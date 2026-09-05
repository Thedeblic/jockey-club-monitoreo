import secrets
import sqlite3
from datetime import date

from werkzeug.security import check_password_hash, generate_password_hash

DB_NAME = "jockey.db"

# Puestos validos para el handball (posicion principal / secundaria)
POSICIONES = ["Arquero", "Lateral", "Central", "Extremo", "Pivote"]

# Roles dentro de la app
ROLES = ["jugador", "cuerpo_tecnico"]

# Campos del perfil que el propio usuario puede editar despues del registro
CAMPOS_EDITABLES = [
    "nombre",
    "apellido",
    "fecha_nacimiento",
    "altura_cm",
    "peso_kg",
    "posicion_principal",
    "posicion_secundaria",
    "numero_camiseta",
]


def get_conexion():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def crear_tablas():
    conn = get_conexion()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'jugador',
            nombre TEXT NOT NULL,
            apellido TEXT NOT NULL,
            fecha_nacimiento TEXT,
            altura_cm REAL,
            peso_kg REAL,
            posicion_principal TEXT,
            posicion_secundaria TEXT,
            numero_camiseta INTEGER,
            foto TEXT,
            activo INTEGER DEFAULT 1,
            token TEXT,
            creado_en TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL,
            fecha TEXT NOT NULL,
            tipo TEXT NOT NULL,
            duracion_min INTEGER NOT NULL,
            srpe INTEGER NOT NULL,
            carga_total INTEGER,
            notas TEXT,
            FOREIGN KEY (jugador_id) REFERENCES usuarios (id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hidratacion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL,
            fecha TEXT NOT NULL,
            contexto TEXT DEFAULT 'partido',
            peso_pre_kg REAL NOT NULL,
            peso_post_kg REAL NOT NULL,
            liquido_ingerido_l REAL,
            duracion_min INTEGER,
            sudador_salado INTEGER DEFAULT 0,
            horas_prox_competencia REAL,
            notas TEXT,
            creado_en TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (jugador_id) REFERENCES usuarios (id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL,
            fecha_lesion TEXT NOT NULL,
            diagnostico TEXT NOT NULL,
            zona TEXT,
            lado TEXT,
            mecanismo TEXT,
            contacto INTEGER DEFAULT 0,
            gravedad TEXT,
            dias_estimados INTEGER,
            fecha_alta TEXT,
            notas TEXT,
            FOREIGN KEY (jugador_id) REFERENCES usuarios (id)
        )
    """)

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Usuarios / autenticacion
# ---------------------------------------------------------------------------


def _edad(fecha_nacimiento):
    if not fecha_nacimiento:
        return None
    nac = date.fromisoformat(fecha_nacimiento)
    hoy = date.today()
    return hoy.year - nac.year - ((hoy.month, hoy.day) < (nac.month, nac.day))


def _armar_usuario(fila):
    """Convierte una fila de 'usuarios' en dict, sin datos secretos y con la edad calculada."""
    usuario = dict(fila)
    usuario.pop("password_hash", None)
    usuario.pop("token", None)
    usuario["edad"] = _edad(usuario.get("fecha_nacimiento"))
    return usuario


def email_existe(email):
    conn = get_conexion()
    fila = conn.execute(
        "SELECT 1 FROM usuarios WHERE email = ?", (email.lower(),)
    ).fetchone()
    conn.close()
    return fila is not None


def crear_usuario(
    email,
    password,
    nombre,
    apellido,
    fecha_nacimiento=None,
    altura_cm=None,
    peso_kg=None,
    posicion_principal=None,
    posicion_secundaria=None,
    numero_camiseta=None,
    rol="jugador",
):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO usuarios
           (email, password_hash, rol, nombre, apellido, fecha_nacimiento,
            altura_cm, peso_kg, posicion_principal, posicion_secundaria, numero_camiseta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            email.lower(),
            generate_password_hash(password),
            rol,
            nombre,
            apellido,
            fecha_nacimiento,
            altura_cm,
            peso_kg,
            posicion_principal,
            posicion_secundaria,
            numero_camiseta,
        ),
    )
    conn.commit()
    nuevo_id = cursor.lastrowid
    conn.close()
    return nuevo_id


def autenticar(email, password):
    """Devuelve (usuario, token) si el login es valido, o (None, None) si no."""
    conn = get_conexion()
    fila = conn.execute(
        "SELECT * FROM usuarios WHERE email = ?", (email.lower(),)
    ).fetchone()

    if fila is None or not check_password_hash(fila["password_hash"], password):
        conn.close()
        return None, None

    token = secrets.token_hex(32)
    conn.execute("UPDATE usuarios SET token = ? WHERE id = ?", (token, fila["id"]))
    conn.commit()
    conn.close()
    return _armar_usuario(fila), token


def usuario_por_token(token):
    if not token:
        return None
    conn = get_conexion()
    fila = conn.execute("SELECT * FROM usuarios WHERE token = ?", (token,)).fetchone()
    conn.close()
    return _armar_usuario(fila) if fila else None


def cerrar_sesion(token):
    conn = get_conexion()
    conn.execute("UPDATE usuarios SET token = NULL WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def obtener_usuario(usuario_id):
    conn = get_conexion()
    fila = conn.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    conn.close()
    return _armar_usuario(fila) if fila else None


def actualizar_perfil(usuario_id, datos):
    """Actualiza solo los campos permitidos que vengan en 'datos'."""
    cambios = {k: datos[k] for k in CAMPOS_EDITABLES if k in datos}
    if not cambios:
        return obtener_usuario(usuario_id)

    asignaciones = ", ".join(f"{campo} = ?" for campo in cambios)
    valores = list(cambios.values()) + [usuario_id]

    conn = get_conexion()
    conn.execute(f"UPDATE usuarios SET {asignaciones} WHERE id = ?", valores)
    conn.commit()
    conn.close()
    return obtener_usuario(usuario_id)


def set_foto(usuario_id, nombre_archivo):
    conn = get_conexion()
    conn.execute(
        "UPDATE usuarios SET foto = ? WHERE id = ?", (nombre_archivo, usuario_id)
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Jugadores (usuarios con rol 'jugador')
# ---------------------------------------------------------------------------


def listar_jugadores():
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM usuarios WHERE rol = 'jugador' AND activo = 1 ORDER BY apellido, nombre"
    ).fetchall()
    conn.close()
    return [_armar_usuario(fila) for fila in filas]


def obtener_jugador(jugador_id):
    conn = get_conexion()
    fila = conn.execute(
        "SELECT * FROM usuarios WHERE id = ? AND rol = 'jugador'", (jugador_id,)
    ).fetchone()
    conn.close()
    return _armar_usuario(fila) if fila else None


# ---------------------------------------------------------------------------
# Sesiones de entrenamiento (carga)
# ---------------------------------------------------------------------------


def insertar_sesion(jugador_id, fecha, tipo, duracion_min, srpe, notas):
    carga_total = duracion_min * srpe

    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO sesiones
           (jugador_id, fecha, tipo, duracion_min, srpe, carga_total, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (jugador_id, fecha, tipo, duracion_min, srpe, carga_total, notas),
    )
    conn.commit()
    nueva_id = cursor.lastrowid
    conn.close()
    return nueva_id, carga_total


def sesiones_de_jugador(jugador_id):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM sesiones WHERE jugador_id = ? ORDER BY fecha", (jugador_id,)
    )
    filas = cursor.fetchall()
    conn.close()
    return [dict(fila) for fila in filas]


# ---------------------------------------------------------------------------
# Hidratacion (peso pre/post partido)
# ---------------------------------------------------------------------------
#
# Base clinica (ACSM / AMSSM Team Physician Consensus Statement):
#   - Deficit = peso_pre - peso_post  (aprox. liquido perdido por sudor)
#   - % perdida de peso corporal = deficit / peso_pre * 100
#   - Reposicion recomendada = 125-150% del deficit (1,25-1,5 L por kg perdido)
#   - No restringir sodio; bebida con electrolitos retiene mejor el liquido
#   - Ingesta fraccionada (no en bolo), dentro de las primeras 6 h
#   - > 5% de perdida o proxima competencia < 24 h => reposicion intensiva
#   - Desaconsejar alcohol (efecto diuretico)

# Umbrales de % de perdida de peso corporal. Editables: son criterio clinico.
HIDRATACION_MINIMA = 2.0   # < 2%   -> verde
HIDRATACION_MODERADA = 3.0  # 2-3%   -> amarillo
HIDRATACION_MARCADA = 5.0   # 3-5%   -> naranja
#                             >= 5%  -> rojo (severa)


def _clasificar_hidratacion(porcentaje):
    if porcentaje < HIDRATACION_MINIMA:
        return "minima", "verde"
    if porcentaje < HIDRATACION_MODERADA:
        return "moderada", "amarillo"
    if porcentaje < HIDRATACION_MARCADA:
        return "marcada", "naranja"
    return "severa", "rojo"


def _armar_hidratacion(fila):
    h = dict(fila)
    pre = h["peso_pre_kg"]
    deficit = round(pre - h["peso_post_kg"], 3)
    ingerido = h.get("liquido_ingerido_l") or 0
    horas_prox = h.get("horas_prox_competencia")

    h["deficit_kg"] = deficit
    h["recuperacion_rapida"] = horas_prox is not None and horas_prox < 24

    if deficit <= 0 or not pre:
        h["porcentaje_perdida"] = 0.0
        h["clasificacion"] = "sin_perdida"
        h["semaforo"] = "verde"
        h["reposicion_min_l"] = 0.0
        h["reposicion_max_l"] = 0.0
    else:
        h["porcentaje_perdida"] = round(deficit / pre * 100, 2)
        h["clasificacion"], h["semaforo"] = _clasificar_hidratacion(h["porcentaje_perdida"])
        h["reposicion_min_l"] = round(deficit * 1.25, 2)
        h["reposicion_max_l"] = round(deficit * 1.5, 2)

    if h.get("duracion_min"):
        h["tasa_sudoracion_l_h"] = round(
            (max(deficit, 0) + ingerido) / (h["duracion_min"] / 60), 2
        )
    else:
        h["tasa_sudoracion_l_h"] = None

    recomendaciones = []
    if deficit > 0:
        recomendaciones.append(
            f"Reponer 125-150% del deficit: {h['reposicion_min_l']}-{h['reposicion_max_l']} L "
            "en las proximas 6 h, de forma fraccionada (no en bolo)."
        )
        recomendaciones.append(
            "No restringir sodio: sumar sodio dietetico o bebida con electrolitos "
            "para retener el liquido y restaurar el volumen plasmatico."
        )
    if h["clasificacion"] == "severa" or h["recuperacion_rapida"]:
        recomendaciones.append(
            "Perdida severa (>5%) o proxima competencia <24 h: reposicion intensiva "
            "de liquidos y electrolitos."
        )
    if h.get("sudador_salado"):
        recomendaciones.append(
            "Sudador salado: la bebida deportiva con electrolitos restaura el balance "
            "hidrico hasta 3x mas rapido que el agua sola."
        )
    if deficit > 0:
        recomendaciones.append(
            "Evitar el consumo excesivo de alcohol en la recuperacion (efecto diuretico)."
        )
    if horas_prox is not None:
        recomendaciones.append(
            "Suspender la ingesta extra 0,5-1 h antes de la proxima competencia."
        )
    h["recomendaciones"] = recomendaciones
    return h


def insertar_hidratacion(
    jugador_id,
    fecha,
    peso_pre_kg,
    peso_post_kg,
    contexto="partido",
    liquido_ingerido_l=None,
    duracion_min=None,
    sudador_salado=False,
    horas_prox_competencia=None,
    notas="",
):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO hidratacion
           (jugador_id, fecha, contexto, peso_pre_kg, peso_post_kg, liquido_ingerido_l,
            duracion_min, sudador_salado, horas_prox_competencia, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            jugador_id,
            fecha,
            contexto,
            peso_pre_kg,
            peso_post_kg,
            liquido_ingerido_l,
            duracion_min,
            1 if sudador_salado else 0,
            horas_prox_competencia,
            notas,
        ),
    )
    conn.commit()
    nueva_id = cursor.lastrowid
    conn.close()
    return nueva_id


def obtener_hidratacion(registro_id):
    conn = get_conexion()
    fila = conn.execute(
        "SELECT * FROM hidratacion WHERE id = ?", (registro_id,)
    ).fetchone()
    conn.close()
    return _armar_hidratacion(fila) if fila else None


def hidratacion_de_jugador(jugador_id):
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM hidratacion WHERE jugador_id = ? ORDER BY fecha DESC", (jugador_id,)
    ).fetchall()
    conn.close()
    return [_armar_hidratacion(fila) for fila in filas]


def listar_hidratacion():
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM hidratacion ORDER BY fecha DESC"
    ).fetchall()
    conn.close()
    return [_armar_hidratacion(fila) for fila in filas]


# ---------------------------------------------------------------------------
# Lesiones
# ---------------------------------------------------------------------------


def _dias_entre(fecha_desde, fecha_hasta):
    d1 = date.fromisoformat(fecha_desde)
    d2 = date.fromisoformat(fecha_hasta)
    return (d2 - d1).days


def _armar_lesion(fila):
    lesion = dict(fila)
    if lesion.get("fecha_alta"):
        lesion["estado"] = "recuperada"
        lesion["dias_baja"] = _dias_entre(lesion["fecha_lesion"], lesion["fecha_alta"])
    else:
        lesion["estado"] = "activa"
        lesion["dias_baja"] = None
    return lesion


def insertar_lesion(
    jugador_id,
    fecha_lesion,
    diagnostico,
    zona,
    lado,
    mecanismo,
    contacto,
    gravedad,
    dias_estimados,
    notas,
):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO lesiones
           (jugador_id, fecha_lesion, diagnostico, zona, lado, mecanismo,
            contacto, gravedad, dias_estimados, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            jugador_id,
            fecha_lesion,
            diagnostico,
            zona,
            lado,
            mecanismo,
            1 if contacto else 0,
            gravedad,
            dias_estimados,
            notas,
        ),
    )
    conn.commit()
    nueva_id = cursor.lastrowid
    conn.close()
    return nueva_id


def listar_lesiones(solo_activas=False):
    conn = get_conexion()
    cursor = conn.cursor()
    if solo_activas:
        cursor.execute(
            "SELECT * FROM lesiones WHERE fecha_alta IS NULL ORDER BY fecha_lesion DESC"
        )
    else:
        cursor.execute("SELECT * FROM lesiones ORDER BY fecha_lesion DESC")
    filas = cursor.fetchall()
    conn.close()
    return [_armar_lesion(fila) for fila in filas]


def lesiones_de_jugador(jugador_id):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM lesiones WHERE jugador_id = ? ORDER BY fecha_lesion DESC",
        (jugador_id,),
    )
    filas = cursor.fetchall()
    conn.close()
    return [_armar_lesion(fila) for fila in filas]


def obtener_lesion(lesion_id):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM lesiones WHERE id = ?", (lesion_id,))
    fila = cursor.fetchone()
    conn.close()
    return _armar_lesion(fila) if fila else None


def registrar_alta(lesion_id, fecha_alta):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE lesiones SET fecha_alta = ? WHERE id = ?", (fecha_alta, lesion_id)
    )
    conn.commit()
    conn.close()

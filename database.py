import sqlite3
from datetime import date

DB_NAME = "jockey.db"


def get_conexion():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def crear_tablas():
    conn = get_conexion()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jugadores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            numero_camiseta INTEGER,
            posicion TEXT,
            activo INTEGER DEFAULT 1
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
            FOREIGN KEY (jugador_id) REFERENCES jugadores (id)
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
            FOREIGN KEY (jugador_id) REFERENCES jugadores (id)
        )
    """)

    conn.commit()
    conn.close()


def insertar_jugador(nombre, numero_camiseta, posicion):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO jugadores (nombre, numero_camiseta, posicion) VALUES (?, ?, ?)",
        (nombre, numero_camiseta, posicion),
    )
    conn.commit()
    nuevo_id = cursor.lastrowid
    conn.close()
    return nuevo_id


def listar_jugadores():
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jugadores")
    filas = cursor.fetchall()
    conn.close()
    return [dict(fila) for fila in filas]


def obtener_jugador(jugador_id):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jugadores WHERE id = ?", (jugador_id,))
    fila = cursor.fetchone()
    conn.close()
    return dict(fila) if fila else None


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
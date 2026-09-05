import sqlite3

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
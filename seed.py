"""Carga datos de ejemplo para probar la app.

    python seed.py

Crea (si no existen) un usuario del cuerpo tecnico, un plantel de handball,
algunas sesiones de carga, un par de lesiones y registros de hidratacion.
No borra nada: si los emails ya existen, los saltea.
"""

import random
from datetime import date, timedelta

import database as db

PASS_CT = "handball2025"
STAFF = [
    ("ct@jockey.com", "Direccion", "Tecnica", "cuerpo_tecnico"),
    ("entrenador@jockey.com", "Martin", "Lopez", "entrenador"),
    ("pf@jockey.com", "Ignacio", "Perez", "preparador_fisico"),
    ("medico@jockey.com", "Laura", "Fernandez", "medico"),
    ("fisio@jockey.com", "Lucia", "Sosa", "fisioterapeuta"),
]

# nombre, apellido, nacimiento, nro, pos_ataque, pos_secundaria, altura, peso, mano, pos_defensiva
PLANTEL = [
    ("Tomas", "Fernandez", "1995-04-12", 3, "Central", "Lateral", 182, 84, "diestro", "1"),
    ("Ignacio", "Herrera", "1998-09-03", 7, "Lateral", "Central", 188, 89, "zurdo", "2"),
    ("Facundo", "Gomez", "1999-01-22", 10, "Central", "Lateral", 185, 86, "diestro", "1"),
    ("Mateo", "Torres", "1997-06-30", 5, "Pivote", None, 193, 98, "diestro", "1"),
    ("Juan Cruz", "Diaz", "2000-11-15", 12, "Arquero", None, 190, 90, "diestro", None),
    ("Lautaro", "Silva", "2001-03-08", 9, "Extremo", "Lateral", 179, 78, "zurdo", "3"),
    ("Agustin", "Peralta", "1996-12-01", 18, "Extremo", None, 181, 80, "diestro", "3"),
    ("Nicolas", "Roldan", "1994-07-19", 4, "Central", "Pivote", 189, 95, "diestro", "1"),
    ("Santiago", "Ruiz", "2002-02-27", 8, "Lateral", "Extremo", 186, 83, "zurdo", "2"),
    ("Bruno", "Molina", "1999-08-14", 21, "Pivote", "Central", 195, 101, "diestro", "1"),
]


def ya_existe(email):
    try:
        return db.email_existe(email)
    except Exception:
        return False


def main():
    db.crear_tablas()

    def id_por_email(email):
        conn = db.get_conexion()
        fila = conn.execute("SELECT id FROM usuarios WHERE email = ?", (email,)).fetchone()
        conn.close()
        return fila["id"] if fila else None

    medico = fisio = None
    for email, nombre, apellido, rol in STAFF:
        if not ya_existe(email):
            db.crear_usuario(email=email, password=PASS_CT, nombre=nombre, apellido=apellido, rol=rol)
        uid = id_por_email(email)
        if rol == "medico":
            medico = {"id": uid, "nombre": nombre, "apellido": apellido, "rol": rol}
        if rol == "fisioterapeuta":
            fisio = {"id": uid, "nombre": nombre, "apellido": apellido, "rol": rol}
    print(f"Staff del cuerpo tecnico: {len(STAFF)} cuentas (pass: {PASS_CT})")

    ids = []
    for nombre, apellido, nac, num, pos1, pos2, altura, peso, mano, defensa in PLANTEL:
        email = f"{nombre}.{apellido}@jockey.com".lower().replace(" ", "")
        if ya_existe(email):
            jugador = next(
                (j for j in db.listar_jugadores() if j["email"] == email), None
            )
            if jugador:
                ids.append(jugador["id"])
            continue
        jid = db.crear_usuario(
            email=email, password="jugador2025", nombre=nombre, apellido=apellido,
            fecha_nacimiento=nac, altura_cm=altura, peso_kg=peso,
            posicion_principal=pos1, posicion_secundaria=pos2, numero_camiseta=num,
            lateralidad=mano, posicion_defensiva=defensa,
        )
        ids.append(jid)
    print(f"Jugadores en el plantel: {len(ids)}")

    # Sesiones de los ultimos 21 dias
    tipos = ["Entrenamiento", "Entrenamiento", "Entrenamiento", "Partido", "Gimnasio"]
    suenos = [
        "Menos de 6 h / Poco reparador", "6-7 h / Regular",
        "7-8 h / Reparador", "7-8 h / Reparador", "Mas de 8 h / Muy reparador",
    ]
    total_ses = 0
    for jid in ids:
        if db.sesiones_de_jugador(jid):
            continue
        for d in range(35, 0, -1):
            if random.random() < 0.55:
                fecha = (date.today() - timedelta(days=d)).isoformat()
                dur = random.choice([60, 75, 90, 90, 100])
                srpe = random.randint(3, 9)
                db.insertar_sesion(
                    jid, fecha, random.choice(tipos), dur, srpe, "",
                    sueno=random.choice(suenos),
                )
                total_ses += 1
    print(f"Sesiones creadas: {total_ses} (ultimos 35 dias)")

    # Lesiones — con el continuo de retorno (RTS)
    if not db.lesiones_de_jugador(ids[3]):
        # Mateo Torres: en Fase 1, lidera el fisio
        lid = db.insertar_lesion(
            ids[3], (date.today() - timedelta(days=12)).isoformat(),
            "Desgarro isquiotibial grado 2", "isquiotibiales", "izquierdo",
            "entrenamiento", False, "moderada", 21, "RM confirma lesion miofascial.",
            criterios_proxima="Fuerza isquios >90% del lado sano · carrera al 80% sin dolor · test funcional completo.",
            autor=medico,
        )
        db.agregar_nota_lesion(lid, fisio, "Inicio de trabajo de fuerza excentrica. Dolor 2/10 al final de la sesion.")
        db.cambiar_estado_lesion(lid, "disponible_entrenar", autor=fisio,
                                 nota="Cumple criterios de carga de la Fase 1. Pasa a entrenar adaptado, sin cambios de direccion a maxima intensidad.")

    if not db.lesiones_de_jugador(ids[1]):
        # Ignacio Herrera: caso cerrado (recorrio todo el continuo)
        lid = db.insertar_lesion(
            ids[1], (date.today() - timedelta(days=60)).isoformat(),
            "Esguince de tobillo grado 1", "tobillo", "derecho",
            "partido", True, "leve", 10, "",
            autor=medico,
        )
        db.cambiar_estado_lesion(lid, "disponible_entrenar", autor=fisio)
        db.cambiar_estado_lesion(lid, "disponible_competir", autor=medico,
                                 nota="Habilitado para competir. Decision consensuada con PF y entrenador.")
        db.cambiar_estado_lesion(lid, "alta", autor=medico,
                                 nota="Cerrado. Sin recidiva, carga y rendimiento en linea de base.")
        # backdatear las fechas para que los dias de baja sean realistas (~11 dias)
        conn = db.get_conexion()
        conn.execute(
            "UPDATE lesiones SET fecha_disponible_competir = ?, fecha_alta = ? WHERE id = ?",
            ((date.today() - timedelta(days=49)).isoformat(),
             (date.today() - timedelta(days=30)).isoformat(), lid),
        )
        conn.commit()
        conn.close()

    if not db.lesiones_de_jugador(ids[2]):
        # Facundo Gomez: historial de 3 lesiones cerradas en 3 temporadas
        historial_fg = [
            (1200, "Molestia de aductores", "aductor", "izquierdo", "entrenamiento", "leve", 14),
            (620, "Esguince de tobillo grado 2", "tobillo", "derecho", "partido", "moderada", 42),
            (170, "Distension isquiotibial grado 1", "isquiotibiales", "derecho", "partido", "leve", 21),
        ]
        fechas = []
        for dias_atras, dx, zona, lado, mec, grav, baja in historial_fg:
            f0 = date.today() - timedelta(days=dias_atras)
            lid = db.insertar_lesion(ids[2], f0.isoformat(), dx, zona, lado, mec, mec == "partido", grav, baja, "", autor=medico)
            db.cambiar_estado_lesion(lid, "disponible_entrenar", autor=fisio)
            db.cambiar_estado_lesion(lid, "disponible_competir", autor=medico)
            db.cambiar_estado_lesion(lid, "alta", autor=medico)
            fechas.append((lid, (f0 + timedelta(days=baja)).isoformat(), (f0 + timedelta(days=baja + 10)).isoformat()))
        conn = db.get_conexion()
        for lid, fdc, fa in fechas:
            conn.execute("UPDATE lesiones SET fecha_disponible_competir = ?, fecha_alta = ? WHERE id = ?", (fdc, fa, lid))
        conn.commit()
        conn.close()

    print("Lesiones creadas: 5 (con timeline de retorno)")

    # Hidratacion para Facundo Gomez
    if not db.hidratacion_de_jugador(ids[2]):
        muestras = [
            (-21, 84.0, 83.1), (-14, 84.5, 82.9), (-7, 85.0, 82.6),
            (-3, 85.2, 81.8), (-1, 85.0, 80.5),
        ]
        for d, pre, post in muestras:
            db.insertar_hidratacion(
                ids[2], (date.today() + timedelta(days=d)).isoformat(),
                pre, post, contexto="partido", duracion_min=90,
                horas_prox_competencia=20 if d == -1 else None,
            )
    print("Hidratacion creada para Facundo Gomez")

    # Calendario: entrenamientos de lun a vie + un partido el sabado, -7 a +21 dias
    if not db.listar_eventos("2000-01-01", "2100-01-01"):
        for delta in range(-7, 22):
            dia = date.today() + timedelta(days=delta)
            wd = dia.weekday()  # 0 = lunes
            if wd < 5:
                db.insertar_evento({
                    "fecha": dia.isoformat(), "tipo": "entrenamiento",
                    "titulo": "Entrenamiento", "hora_inicio": "19:00", "hora_fin": "21:00",
                    "lugar": "Club",
                })
            elif wd == 5:
                local = (dia.isocalendar()[1] % 2 == 0)
                db.insertar_evento({
                    "fecha": dia.isoformat(), "tipo": "partido",
                    "titulo": "vs " + ("Universitario" if local else "CIC"),
                    "hora_inicio": "20:00",
                    "condicion": "local" if local else "visitante",
                    "lugar": "Estadio Jockey Club, Cordoba" if local else "Polideportivo CIC, Rosario",
                    "rival": "Universitario" if local else "CIC",
                })
            else:
                db.insertar_evento({
                    "fecha": dia.isoformat(), "tipo": "recuperacion",
                    "titulo": "Descanso / recuperacion",
                })
        print("Calendario cargado (entrenamientos, partidos y descansos)")

    print("\nListo. Cuentas del staff (todas con pass", PASS_CT + "):")
    for email, _, _, rol in STAFF:
        print(f"  {email:<24} {rol}")
    print("  jugador de prueba: facundo.gomez@jockey.com / jugador2025")


if __name__ == "__main__":
    main()

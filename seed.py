"""Carga datos de ejemplo para probar la app.

    python seed.py

Crea (si no existen) un usuario del cuerpo tecnico, un plantel de handball,
algunas sesiones de carga, un par de lesiones y registros de hidratacion.
No borra nada: si los emails ya existen, los saltea.
"""

import random
from datetime import date, timedelta

import database as db

CT = {
    "email": "ct@jockey.com",
    "password": "handball2025",
    "nombre": "Cuerpo",
    "apellido": "Tecnico",
    "rol": "cuerpo_tecnico",
}

PLANTEL = [
    ("Tomas", "Fernandez", "1995-04-12", 3, "Central", "Lateral", 182, 84),
    ("Ignacio", "Herrera", "1998-09-03", 7, "Lateral", "Central", 188, 89),
    ("Facundo", "Gomez", "1999-01-22", 10, "Central", "Lateral", 185, 86),
    ("Mateo", "Torres", "1997-06-30", 5, "Pivote", None, 193, 98),
    ("Juan Cruz", "Diaz", "2000-11-15", 12, "Arquero", None, 190, 90),
    ("Lautaro", "Silva", "2001-03-08", 9, "Extremo", "Lateral", 179, 78),
    ("Agustin", "Peralta", "1996-12-01", 18, "Extremo", None, 181, 80),
    ("Nicolas", "Roldan", "1994-07-19", 4, "Central", "Pivote", 189, 95),
    ("Santiago", "Ruiz", "2002-02-27", 8, "Lateral", "Extremo", 186, 83),
    ("Bruno", "Molina", "1999-08-14", 21, "Pivote", "Central", 195, 101),
]


def ya_existe(email):
    try:
        return db.email_existe(email)
    except Exception:
        return False


def main():
    db.crear_tablas()

    if not ya_existe(CT["email"]):
        db.crear_usuario(
            email=CT["email"], password=CT["password"],
            nombre=CT["nombre"], apellido=CT["apellido"], rol=CT["rol"],
        )
        print(f"CT creado: {CT['email']} / {CT['password']}")
    else:
        print(f"CT ya existia: {CT['email']}")

    ids = []
    for nombre, apellido, nac, num, pos1, pos2, altura, peso in PLANTEL:
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

    # Lesiones (Mateo Torres activa, Ignacio Herrera recuperada)
    if not db.lesiones_de_jugador(ids[3]):
        db.insertar_lesion(
            ids[3], (date.today() - timedelta(days=12)).isoformat(),
            "Desgarro isquiotibial grado 2", "isquiotibiales", "izquierdo",
            "entrenamiento", False, "moderada", 21, "RM confirma lesion miofascial.",
        )
    if not db.lesiones_de_jugador(ids[1]):
        lid = db.insertar_lesion(
            ids[1], (date.today() - timedelta(days=60)).isoformat(),
            "Esguince de tobillo grado 1", "tobillo", "derecho",
            "partido", True, "leve", 10, "",
        )
        db.registrar_alta(lid, (date.today() - timedelta(days=49)).isoformat())
    print("Lesiones creadas: 2")

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

    print("\nListo. Entra con:", CT["email"], "/", CT["password"])


if __name__ == "__main__":
    main()

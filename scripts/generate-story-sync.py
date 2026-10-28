"""Genera MP3, transcripciones y tiempos de historias en español.

Uso:
  python scripts/generate-story-sync.py

El texto original de la historia se conserva; Whisper solo aporta los tiempos.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

from faster_whisper import WhisperModel


ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "web" / "public" / "media"
DATA = ROOT / "web" / "src" / "data"
FFMPEG = Path(r"C:\Users\JOTA\AppData\Local\Temp\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe")
MODEL = sys.argv[1] if len(sys.argv) > 1 else "small"

AUDIOS = [
    (MEDIA / "historia-01.ogg", MEDIA / "historia-01.mp3"),
    (MEDIA / "historia-02.ogg", MEDIA / "historia-02.mp3"),
]


def normalizar(texto: str) -> list[str]:
    texto = unicodedata.normalize("NFD", texto.lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", texto)


def obtener_texto_original() -> str:
    categorias = json.loads((DATA / "categories.json").read_text(encoding="utf-8"))
    candidato = next(
        n for c in categorias if c["id"] == "secuencia-del-a-o"
        for n in c.get("nominados", []) if n["id"] == "n45"
    )
    return " ".join(b["contenido"] for b in candidato.get("story", []) if b.get("tipo") == "texto")


def convertir(origen: Path, destino: Path) -> None:
    if not FFMPEG.exists():
        raise FileNotFoundError(f"No se encontró ffmpeg en {FFMPEG}")
    destino.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [str(FFMPEG), "-y", "-i", str(origen), "-codec:a", "libmp3lame", "-q:a", "2", str(destino)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def transcribir(model: WhisperModel, audio: Path) -> tuple[list[dict], float]:
    segmentos, info = model.transcribe(
        str(audio), language="es", beam_size=5, word_timestamps=True, vad_filter=True
    )
    palabras = []
    texto = []
    for segmento in segmentos:
        texto.append(segmento.text.strip())
        for palabra in segmento.words or []:
            if palabra.word.strip():
                palabras.append({"texto": palabra.word.strip(), "inicio": palabra.start, "fin": palabra.end})
    (audio.with_suffix(".txt")).write_text(" ".join(texto).strip() + "\n", encoding="utf-8")
    duracion = max([p["fin"] for p in palabras] + [float(info.duration or 0)])
    return palabras, duracion


def alinear(texto: str, palabras: list[dict]) -> list[dict]:
    frases = [f.strip() for f in re.findall(r"[^.!?]+(?:[.!?]+|$)", texto) if f.strip()]
    objetivos = [normalizar(f) for f in frases]
    total_objetivo = max(1, sum(len(x) for x in objetivos))
    cursor = 0
    salida = []

    for frase, objetivo in zip(frases, objetivos):
        esperado = max(1, round(len(objetivo) / total_objetivo * len(palabras)))
        centro = cursor + esperado
        candidatos = range(max(cursor + 1, centro - 12), min(len(palabras), centro + 13))
        mejor_fin, mejor_puntaje = min(len(palabras), cursor + esperado), -1.0
        for fin in candidatos:
            transcripto = [normalizar(palabras[i]["texto"])[0] for i in range(cursor, fin) if normalizar(palabras[i]["texto"])]
            puntaje = SequenceMatcher(None, objetivo, transcripto).ratio()
            if puntaje > mejor_puntaje:
                mejor_fin, mejor_puntaje = fin, puntaje
        if mejor_fin <= cursor:
            mejor_fin = min(len(palabras), cursor + 1)
        inicio = palabras[cursor]["inicio"]
        fin = palabras[mejor_fin - 1]["fin"]
        salida.append({"inicio": round(inicio, 2), "fin": round(fin, 2), "texto": frase})
        cursor = mejor_fin

    return salida


def separar_por_audio(frases: list[dict], duraciones: list[float]) -> list[list[dict]]:
    resultado = [[] for _ in duraciones]
    acumulado = 0.0
    rangos = []
    for duracion in duraciones:
        rangos.append((acumulado, acumulado + duracion))
        acumulado += duracion
    for frase in frases:
        for indice, (inicio_audio, fin_audio) in enumerate(rangos):
            if frase["fin"] > inicio_audio and frase["inicio"] < fin_audio:
                resultado[indice].append({
                    "inicio": round(max(0, frase["inicio"] - inicio_audio), 2),
                    "fin": round(min(fin_audio, frase["fin"]) - inicio_audio, 2),
                    "texto": frase["texto"],
                })
    return resultado


def main() -> None:
    for origen, destino in AUDIOS:
        convertir(origen, destino)

    print(f"Cargando modelo faster-whisper: {MODEL}")
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    palabras_totales = []
    duraciones = []
    for _, mp3 in AUDIOS:
        palabras, duracion = transcribir(model, mp3)
        palabras_totales.extend([{**p, "inicio": p["inicio"] + sum(duraciones), "fin": p["fin"] + sum(duraciones)} for p in palabras])
        duraciones.append(duracion)

    frases = alinear(obtener_texto_original(), palabras_totales)
    por_audio = separar_por_audio(frases, duraciones)
    sincronizacion = {
        "n45": {
            "audios": [f"/media/{mp3.name}" for _, mp3 in AUDIOS],
            "tiempos": por_audio,
        }
    }
    (DATA / "storyTimings.json").write_text(json.dumps(sincronizacion, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Listo: storyTimings.json y transcripciones .txt generados.")


if __name__ == "__main__":
    main()

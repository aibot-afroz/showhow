#!/usr/bin/env python3
"""Makes voice.mp3 from script.txt with Kokoro, free and on this machine, in place of voice.py and tighten.py.

usage: ../models/kokoro-venv/bin/python scripts/voice_kokoro.py <slug>

Each paragraph is voiced on its own and joined by a set silence, so every scene change lands inside real silence.
reel.json example:
  "voice": { "engine": "kokoro", "id": "af_heart", "speed": 1.0 }

There are no character times, so remove any old voice.alignment.json: align.py then times the words with whisper.cpp.
Setup: a venv at models/kokoro-venv with kokoro-onnx and soundfile, and kokoro-v1.0.onnx and voices-v1.0.bin in models/.
"""
import json, subprocess, sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ENGINE = Path(__file__).resolve().parent.parent
MODELS = ENGINE.parent / "models"
LEAD, BREATH, TAIL = 0.15, 0.4, 1.5  # seconds of silence: before the first word, between paragraphs, after the last word

slug = sys.argv[1]
reel = ENGINE / "reels" / slug
voice = json.loads((reel / "reel.json").read_text())["voice"]
paragraphs = [p.strip().replace("\n", " ") for p in (reel / "script.txt").read_text().split("\n\n") if p.strip()]

kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
takes, rate = [], 24000
for p in paragraphs:
    audio, rate = kokoro.create(p, voice=voice["id"], speed=voice.get("speed", 1.0), lang="en-us")
    takes.append(np.trim_zeros(audio))

quiet = lambda s: np.zeros(int(s * rate), dtype=takes[0].dtype)
parts = [quiet(LEAD)]
for i, take in enumerate(takes):
    parts += [take, quiet(TAIL if i == len(takes) - 1 else BREATH)]

wav = reel / "voice.raw.wav"
sf.write(wav, np.concatenate(parts), rate)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", "192k", str(reel / "voice.mp3")], check=True)
wav.unlink()
print(f"{slug}: {len(takes)} paragraphs, {sum(map(len, parts)) / rate:.2f} s, voice {voice['id']}")

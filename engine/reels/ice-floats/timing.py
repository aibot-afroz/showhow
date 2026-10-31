#!/usr/bin/env python3
"""The silent cut's words.json: caption.txt timed at a reading pace, in place of align.py, which needs a voice.

usage: python3 reels/ice-floats/timing.py     (from engine/)
Render with --caption, since with no voice the caption carries every word.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "scripts"))
from align import parse

WPS = 3.5        # reading pace, words a second, not counting the pauses
BLOCK = 0.22     # pause between caption blocks
SENTENCE = 0.4   # pause after a full stop
SCENE = 0.7      # pause at a scene change
HOLD = 2.0       # the last picture stays up

parsed = parse((HERE / "caption.txt").read_text())
scenes, blocks, words = parsed[0], parsed[1], parsed[2]
first_of_scene = {s["firstWord"] for s in scenes}
first_of_block = {b["words"][0] for b in blocks}

mean = sum(len(w["w"]) + 3 for w in words) / len(words)
t, silences = 0.3, [[0.0, 0.3]]
for i, w in enumerate(words):
    if i and i in first_of_block:
        gap = SCENE if i in first_of_scene else SENTENCE if words[i - 1]["w"].endswith(".") else BLOCK
        silences.append([round(t, 3), round(t + gap, 3)])
        t += gap
    w["t"] = round(t, 3)
    t += (len(w["w"]) + 3) / mean / WPS
    w["e"] = round(t, 3)
silences.append([round(t, 3), round(t + HOLD, 3)])

out = {"duration": round(t + HOLD, 3), "silences": silences, "scenes": scenes, "blocks": blocks, "words": words}
(HERE / "words.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print(f"{len(words)} words, {len(blocks)} blocks, {len(scenes)} scenes, {out['duration']} s")

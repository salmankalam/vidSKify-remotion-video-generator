#!/usr/bin/env python3
"""Synthesise one narration line to MP3 with Edge TTS.

Reads a JSON job on stdin: {text, voice, rate, pitch, out}. Writes the MP3 to
`out` and prints {"seconds": <float>} on stdout. The duration comes from the
last WordBoundary event, which is the spoken length the renderer needs for
frame-exact cuts (decoding the MP3 just to measure it is slower and less exact).

Install once with:  pip install edge-tts
"""

import asyncio
import json
import os
import sys


async def run(job: dict) -> dict:
    try:
        import edge_tts
    except ImportError:
        raise SystemExit("edge-tts is not installed. Run: pip install edge-tts")

    out = job["out"]
    last_end = 0
    wrote_audio = False

    communicate = edge_tts.Communicate(
        job["text"],
        job["voice"],
        rate=job.get("rate") or "+0%",
        pitch=job.get("pitch") or "+0Hz",
        boundary="WordBoundary",
    )

    with open(out, "wb") as handle:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                handle.write(chunk["data"])
                wrote_audio = True
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                last_end = max(last_end, chunk["offset"] + chunk["duration"])

    if not wrote_audio or os.path.getsize(out) == 0:
        raise RuntimeError("edge-tts returned no audio")

    return {"seconds": round(last_end / 10_000_000, 3)}


def main() -> int:
    try:
        job = json.load(sys.stdin)
    except ValueError:
        print("invalid job payload", file=sys.stderr)
        return 2

    try:
        result = asyncio.run(run(job))
    except Exception as error:  # surfaced to the render log
        print(str(error), file=sys.stderr)
        return 1

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())

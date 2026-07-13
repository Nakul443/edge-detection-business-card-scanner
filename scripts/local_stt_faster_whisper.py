import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_file")
    parser.add_argument("--model", default=os.environ.get("LOCAL_STT_MODEL", "tiny.en"))
    parser.add_argument("--model-dir", default=os.environ.get("LOCAL_STT_MODEL_DIR"))
    parser.add_argument("--device", default=os.environ.get("LOCAL_STT_DEVICE", "cpu"))
    parser.add_argument("--compute-type", default=os.environ.get("LOCAL_STT_COMPUTE_TYPE", "int8"))
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "faster-whisper is not installed. Run: pip install faster-whisper",
                }
            )
        )
        return 2

    model_name_or_path = args.model_dir or args.model
    try:
        model = WhisperModel(
            model_name_or_path,
            device=args.device,
            compute_type=args.compute_type,
            local_files_only=bool(args.model_dir),
        )
        segments, info = model.transcribe(
            args.audio_file,
            beam_size=1,
            language="en",
            vad_filter=True,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        print(
            json.dumps(
                {
                    "ok": True,
                    "text": text,
                    "language": info.language,
                    "languageProbability": info.language_probability,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())

# 영상 속 말소리 받아쓰기 (faster-whisper)
# 사용: python stt_whisper.py < jobs.json
#   jobs.json = {"model": "large-v3", "model_dir": "...", "language": "ko",
#                "files": [{"audio": "a.wav", "out": "a.json"}, ...]}
# 모델은 한 번만 불러서 여러 파일을 차례로 처리한다. 결과는 파일마다 JSON으로 저장.
import json
import sys


def load_model(name, model_dir):
    from faster_whisper import WhisperModel
    try:
        return WhisperModel(name, device="cuda", compute_type="float16", download_root=model_dir or None), "cuda"
    except Exception as e:  # 그래픽카드를 못 쓰면 CPU로 (느림)
        print(f"[stt] GPU 사용 불가, CPU로 진행: {e}", file=sys.stderr)
        return WhisperModel(name, device="cpu", compute_type="int8", download_root=model_dir or None), "cpu"


def main():
    jobs = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    model, device = load_model(jobs.get("model") or "large-v3", jobs.get("model_dir"))
    for job in jobs["files"]:
        segments, info = model.transcribe(
            job["audio"],
            language=jobs.get("language") or None,
            beam_size=5,
            vad_filter=True,  # 말소리가 없는 구간은 건너뛴다
            condition_on_previous_text=False,  # 같은 말 되풀이(환각) 줄이기
        )
        segs = []
        for s in segments:
            text = s.text.strip()
            if not text:
                continue
            segs.append({
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "text": text,
                "no_speech": round(s.no_speech_prob, 3),
                "logprob": round(s.avg_logprob, 3),
            })
        result = {"language": info.language, "language_prob": round(info.language_probability, 3),
                  "device": device, "segments": segs}
        with open(job["out"], "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        print(f"[stt] {job['audio']}: {len(segs)}구간", file=sys.stderr)


if __name__ == "__main__":
    main()

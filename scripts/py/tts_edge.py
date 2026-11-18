"""무료 한국어 음성 (Microsoft Edge 읽어주기 음성, edge-tts 패키지)
사용: python tts_edge.py <음성이름> <속도 예: +5%> <출력.mp3>   (읽을 글은 표준입력으로)
설치: pip install edge-tts
"""
import asyncio
import os
import ssl
import sys

import edge_tts
from edge_tts import communicate as _c

# 회사망·프록시처럼 인증서를 따로 쓰는 환경이면 SSL_CERT_FILE 을 따른다
_ca = os.environ.get("SSL_CERT_FILE")
if _ca and os.path.exists(_ca):
    _c._SSL_CTX = ssl.create_default_context(cafile=_ca)


async def main():
    voice, rate, out = sys.argv[1], sys.argv[2], sys.argv[3]
    text = sys.stdin.read().strip()
    if not text:
        sys.exit("읽을 글이 없어요")
    await edge_tts.Communicate(text, voice, rate=rate).save(out)


asyncio.run(main())

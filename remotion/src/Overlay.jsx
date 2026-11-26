// 화면 글자 층: 인기 쇼츠처럼 튀어나오는 제목, 컷마다 바뀌는 자막, 기울어진 가격표, 번호 이름표
import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont } from '@remotion/fonts';

// 글꼴 (앱의 assets/fonts 를 publicDir 로 씀)
const FONTS = [
  ['BlackHanSans', 'BlackHanSans-Regular.ttf'],
  ['NanumGothicExtraBold', 'NanumGothic-ExtraBold.ttf'],
];
// Remotion 공식 글꼴 불러오기: 글꼴이 다 올라올 때까지 프레임을 그리지 않고 기다린다 (긴 영상·여러 탭에서도)
for (const [family, file] of FONTS) {
  loadFont({ family, url: staticFile(`fonts/${file}`), weight: '400' }).catch((e) => console.warn('글꼴 실패', family, e));
}
function useFonts() {}

const stroke = (px, color = '#000') => ({ WebkitTextStroke: `${px}px ${color}`, paintOrder: 'stroke fill' });

/** 숫자(가격·개수·시간)는 노란색으로 강조 */
function Highlighted({ text }) {
  const parts = String(text).split(/(\d[\d,.]*\s*(?:원|분|시간|개|인분|팩|가지|초|층|%)?)/g);
  return parts.map((p, i) => (/^\d/.test(p) ? <span key={i} style={{ color: '#FFE14D' }}>{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>));
}

/** 공통 움직임: 튀어나옴(spring) + 끝에서 사라짐 */
function usePop(durationInFrames, { from = 0.7, damping = 11 } = {}) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping, stiffness: 180, mass: 0.6 } });
  const scale = interpolate(s, [0, 1], [from, 1]);
  const out = interpolate(f, [durationInFrames - 5, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = Math.min(interpolate(f, [0, 3], [0, 1], { extrapolateRight: 'clamp' }), out);
  return { scale, opacity, frame: f };
}

function Hook({ text, dur, L, W, vertical }) {
  const { scale, opacity } = usePop(dur, { from: 0.55, damping: 10 });
  const lines = String(text).split('\n');
  // 인기 쇼츠의 첫 화면 큰 글씨는 화면 높이의 20~40%: 글자 수가 적을수록 크게, 화면 폭 안에서 최대로
  const maxChars = Math.max(...lines.map((l) => l.replace(/\s/g, '').length + l.split(' ').length * 0.3), 1);
  const room = W - L.marginL - L.marginR;
  const size = Math.round(Math.min(vertical ? 160 : 120, Math.max(vertical ? 84 : 72, room / maxChars)));
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: L.hookTop, paddingLeft: L.marginL, paddingRight: L.marginR }}>
      <div style={{ transform: `scale(${scale}) rotate(-2deg)`, opacity, textAlign: 'center', fontFamily: 'BlackHanSans', lineHeight: 1.12, maxWidth: W - L.marginL - L.marginR }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: size, color: i === lines.length - 1 && lines.length > 1 ? '#FFE14D' : '#FFFFFF', ...stroke(14), textShadow: '0 8px 18px rgba(0,0,0,.45)' }}>{l}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function Caption({ text, dur, L, vertical }) {
  const { scale, opacity } = usePop(dur, { from: 0.86, damping: 14 });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: L.captionBottom, paddingLeft: L.marginL, paddingRight: L.marginR }}>
      <div style={{ transform: `scale(${scale})`, opacity, fontFamily: 'NanumGothicExtraBold', fontSize: vertical ? 70 : 58, color: '#fff', textAlign: 'center', lineHeight: 1.25, ...stroke(11), textShadow: '0 5px 12px rgba(0,0,0,.5)' }}>
        <Highlighted text={text} />
      </div>
    </AbsoluteFill>
  );
}

function Price({ text, dur, L, vertical }) {
  const { scale, opacity } = usePop(dur, { from: 0.2, damping: 8 });
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: L.priceTop }}>
      <div style={{ transform: `scale(${scale}) rotate(-4deg)`, opacity, background: '#FFD400', color: '#111', fontFamily: 'BlackHanSans', fontSize: vertical ? 78 : 64, padding: '10px 34px 14px', borderRadius: 22, border: '6px solid #111', boxShadow: '0 10px 0 #111' }}>
        {text}
      </div>
    </AbsoluteFill>
  );
}

function Label({ text, dur, L, vertical }) {
  const { opacity, frame } = usePop(dur);
  const { fps } = useVideoConfig();
  const y = interpolate(spring({ frame, fps, config: { damping: 15 } }), [0, 1], [-40, 0]);
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: L.labelTop }}>
      <div style={{ transform: `translateY(${y}px)`, opacity, background: '#fff', color: '#111', fontFamily: 'NanumGothicExtraBold', fontSize: vertical ? 56 : 46, padding: '12px 30px', borderRadius: 16, boxShadow: '0 6px 16px rgba(0,0,0,.35)' }}>
        {text}
      </div>
    </AbsoluteFill>
  );
}

function Chapter({ text, dur }) {
  const { opacity, frame } = usePop(dur);
  const x = interpolate(frame, [0, 8], [-60, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ padding: 60 }}>
      <div style={{ transform: `translateX(${x}px)`, opacity, alignSelf: 'flex-start', background: 'rgba(0,0,0,.65)', color: '#fff', fontFamily: 'NanumGothicExtraBold', fontSize: 46, padding: '12px 26px', borderRadius: 12, borderLeft: '10px solid #FFD400' }}>
        {text}
      </div>
    </AbsoluteFill>
  );
}

/** 가게 이름: 위쪽에 작게 고정 (첫 제목이 사라진 뒤 끝까지) */
function Place({ text, dur, L, vertical }) {
  const { opacity, frame } = usePop(dur);
  const x = interpolate(frame, [0, 8], [-30, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: L.placeTop }}>
      <div style={{ transform: `translateX(${x}px)`, opacity, display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(0,0,0,.55)', color: '#fff', fontFamily: 'NanumGothicExtraBold', fontSize: vertical ? 44 : 36, padding: '10px 26px', borderRadius: 999 }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: '#FFD400', display: 'inline-block' }} />
        {text}
      </div>
    </AbsoluteFill>
  );
}

/** 네이버 클립식 위쪽 검은 띠 제목: 첫 줄 흰색, 둘째 줄 노란색, 영상 끝까지 */
function Title({ text, dur, W }) {
  const { opacity } = usePop(dur);
  const lines = String(text).split('\n');
  const maxChars = Math.max(...lines.map((l) => l.length), 1);
  const size = Math.round(Math.min(84, Math.max(56, (W - 120) / maxChars)));
  return (
    <AbsoluteFill style={{ alignItems: 'stretch' }}>
      <div style={{ opacity, marginTop: 120, background: 'rgba(0,0,0,.78)', padding: '22px 40px', textAlign: 'center', fontFamily: 'BlackHanSans', lineHeight: 1.15 }}>
        {lines.map((l, i) => <div key={i} style={{ fontSize: size, color: i === lines.length - 1 && lines.length > 1 ? '#FFE14D' : '#FFFFFF' }}>{l}</div>)}
      </div>
    </AbsoluteFill>
  );
}

const PARTS = { title: Title, place: Place, hook: Hook, caption: Caption, price: Price, label: Label, chapter: Chapter };
// 겹칠 때 위에 오는 순서
const Z = { title: 0, place: 0, caption: 1, chapter: 2, label: 3, hook: 4, price: 5 };

export const Overlay = ({ video, events = [], layout, width, height }) => {
  useFonts();
  const { fps } = useVideoConfig();
  const vertical = height > width;
  const sorted = [...events].sort((a, b) => (Z[a.type] || 0) - (Z[b.type] || 0));
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {video ? <OffthreadVideo src={video} muted /> : null}
      {sorted.map((e, i) => {
        const C = PARTS[e.type];
        const from = Math.round(e.start * fps);
        const dur = Math.max(2, Math.round((e.end - e.start) * fps));
        return C ? (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <C text={e.text} dur={dur} L={layout} W={width} vertical={vertical} />
          </Sequence>
        ) : null;
      })}
    </AbsoluteFill>
  );
};

import React from 'react';
import { Composition } from 'remotion';
import { Overlay } from './Overlay.jsx';

// 길이·크기는 렌더할 때 넘겨주는 props 로 정한다
const calculateMetadata = ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(props.duration * props.fps)),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

const sample = {
  video: '', duration: 6, fps: 30, width: 1080, height: 1920,
  layout: { captionBottom: 420, hookTop: 300, priceTop: 560, labelTop: 330, marginL: 70, marginR: 70 },
  events: [
    { type: 'hook', start: 0, end: 2.8, text: '역삼 숯불 삼겹살\n평일도 웨이팅 20분' },
    { type: 'label', start: 3, end: 6, text: '1. 두툼 삼겹살' },
    { type: 'caption', start: 0.1, end: 2.9, text: '직원이 다 구워줘요' },
    { type: 'caption', start: 3, end: 6, text: '1인분 15,000원' },
    { type: 'price', start: 3.3, end: 5.9, text: '15,000원' },
  ],
};

export const Root = () => (
  <Composition id="Overlay" component={Overlay} defaultProps={sample} calculateMetadata={calculateMetadata}
    durationInFrames={180} fps={30} width={1080} height={1920} />
);

// 제작 상황을 알림 모듈(텔레그램 등)에 전달하는 통로
import { EventEmitter } from 'node:events';

/**
 * 'started'  (projectId)
 * 'step'     (projectId, stepText, progress)
 * 'ready'    (projectId)            전체 완성
 * 'failed'   (projectId, message)
 * 'output'   (projectId, key)       결과물 하나를 다시 만든 뒤
 * 'output-failed' (projectId, key, message)
 */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

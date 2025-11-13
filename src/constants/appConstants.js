/**
 * 애플리케이션 상수 정의
 * @module appConstants
 */

/**
 * 꽃 SVG 파일 경로
 * @type {string}
 */
export const FLOWER_SVG_URL = "/flower.svg";

/**
 * 꽃의 목표 너비 (픽셀)
 * @type {number}
 */
export const FLOWER_TARGET_WIDTH = 730;

/**
 * 꽃 경로 확장 배율 (텍스트 배치 영역 확대용)
 * @type {number}
 */
export const FLOWER_EXPANSION_SCALE = 1.05;

/**
 * 꽃 X축 오프셋 (픽셀)
 * @type {number}
 */
export const FLOWER_OFFSET_X = 5;

/**
 * 텍스트 폰트 크기 (픽셀)
 * @type {number}
 */
export const FONT_SIZE_PX = 15;

/**
 * 텍스트 줄 높이 (픽셀)
 * @type {number}
 */
export const LINE_HEIGHT_PX = 21;

/**
 * 인식된 텍스트를 화면에 표시하는 시간 (밀리초)
 * @type {number}
 */
export const RESULT_DISPLAY_DELAY_MS = 1500;

/**
 * 캔버스 페이드 애니메이션 지속 시간 (밀리초)
 * @type {number}
 */
export const CANVAS_FADE_DURATION_MS = 800;

/**
 * 렌더링 완료 후 idle 상태로 복귀하는 대기 시간 (밀리초)
 * @type {number}
 */
export const RENDER_IDLE_DELAY_MS = 500;

/**
 * 새 텍스트 페이드인 애니메이션 지속 시간 (밀리초)
 * @type {number}
 */
export const NEW_TEXT_FADE_DURATION_MS = 1500;

/**
 * 침묵 지속 시 음성 인식 종료 타임아웃 (밀리초)
 * @type {number}
 */
export const SILENCE_TIMEOUT_MS = 1000;

/**
 * 음성 인식 활성화를 위한 최소 볼륨 임계값 (0.0 ~ 1.0)
 * @type {number}
 */
export const VOLUME_THRESHOLD = 0.08;

/**
 * 볼륨 체크 간격 (밀리초)
 * @type {number}
 */
export const VOLUME_CHECK_INTERVAL_MS = 100;


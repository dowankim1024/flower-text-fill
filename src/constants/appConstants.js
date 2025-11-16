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
export const NEW_TEXT_FADE_DURATION_MS = 1200;

/**
 * 침묵 지속 시 음성 인식 종료 타임아웃 (밀리초)
 * @type {number}
 */
export const SILENCE_TIMEOUT_MS = 1000;

/**
 * 음성 인식 활성화를 위한 최소 볼륨 임계값 (0.0 ~ 1.0)
 * @type {number}
 */
export const VOLUME_THRESHOLD = 0.15;

/**
 * 볼륨 체크 간격 (밀리초)
 * @type {number}
 */
export const VOLUME_CHECK_INTERVAL_MS = 50;

/**
 * 음성 인식 재시작 지연 (밀리초)
 * @type {number}
 */
export const RECOGNITION_RESTART_DELAY_MS = 500;

/**
 * 음성 인식 최대 연속 재시도 횟수
 * @type {number}
 */
export const RECOGNITION_MAX_RETRIES = 3;

/**
 * 렌더링 상태가 특정 시간 이상 지속되면 강제 idle로 전환하는 워치독 간격 (밀리초)
 * @type {number}
 */
export const RENDER_IDLE_WATCHDOG_MS = 5000;

/**
 * 오디오 컨텍스트/마이크 상태 확인 주기 (밀리초)
 * @type {number}
 */
export const AUDIO_HEALTH_CHECK_INTERVAL_MS = 15000;

/**
 * 마이크 스트림 재요청 전 대기 시간 (밀리초)
 * @type {number}
 */
export const MIC_RECOVERY_BACKOFF_MS = 1000;


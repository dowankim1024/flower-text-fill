# 꽃 방명록 인터랙티브 캔버스

각각이 모여_낱개의 글
하나로_하나의 이미지
부분을 클로즈업하면 관람객의 방문록이 보이고, 
전체를 보면 큰 그림이 보인다.
처음엔 아무것도 보이지 않는다. 하지만 흔적이 모이며, 보이지 않던 형태가 드러난다.
이것은 우리가 무언가를 클로즈업해서 보게 될 때, 처음엔 이해할 수 없지만 시간이 지나고 시선이 넓어질수록 점점 그 의미를 알아가는 과정과 닮아 있다.

<img width="1920" height="1080" alt="202732" src="https://github.com/user-attachments/assets/4af9f3ee-b0ac-4108-b45f-4655de45265e" />

방문자가 마이크에 대고 남긴 말을 꽃 모양 내부에 한 글자씩 채워 넣는 웹 애플리케이션입니다. Web Speech API, Web Audio API, Canvas API를 조합해 전시 환경에서도 안정적으로 동작하도록 설계했으며, 음성 인식 → 확인 → 렌더링 → 대기 과정을 끊김 없이 반복합니다.

## Designer : Park Se Eun (03eungreen@naver.com)

## Engineer : Kim Do Wan (kimdowan1004@naver.com)

### 배포 링크 : https://flower-text-fill.vercel.app


---

## 목차

1. [주요 기능](#주요-기능)
2. [기술 스택](#기술-스택)
3. [시스템 요구 사항](#시스템-요구-사항)
4. [설치 및 실행](#설치-및-실행)
5. [디렉터리 구조](#디렉터리-구조)
6. [핵심 동작 개요](#핵심-동작-개요)
7. [세부 구현](#세부-구현)
8. [전시/운영 가이드](#전시운영-가이드)
9. [품질 관리](#품질-관리)
10. [향후 개선 아이디어](#향후-개선-아이디어)
11. [트러블슈팅 로그](#트러블슈팅-로그)

---

## 주요 기능

- **연속 음성 인식 루프**: `idle → listening → done → rendering → idle` 상태 머신을 통해 사용자가 별도로 버튼을 누르지 않아도 지속적으로 음성을 수집합니다.
- **볼륨 기반 자동 시작**: Web Audio API로 주변 소음을 실시간 측정해 `VOLUME_THRESHOLD` 이상일 때만 음성 인식을 시작합니다.
- **침묵 타임아웃**: 사용자가 문장을 잠시 멈춰도 `SILENCE_TIMEOUT_MS` 동안 기다렸다가 최종 문장을 처리합니다.
- **꽃 경로 텍스트 레이아웃**: SVG 경로를 `Path2D`로 변환해 `isPointInPath` 검사와 `measureText`를 조합, 텍스트가 꽃 안쪽 경로에서만 자연스럽게 흐르도록 배치합니다.
- **바닥에서 위로 쌓이는 레이아웃**: 새 문장이 추가될 때마다 캔버스 하단부터 글자를 채워 위로 올립니다.
- **페이드 애니메이션**: 기존 텍스트는 페이드아웃 후 제거되고, 새 글자는 2.5초 동안 천천히 페이드인합니다.
- **로컬 저장소 연동**: 누적 문장을 `localStorage`에 보관해 새로고침에도 기록이 유지됩니다.
- **전시 친화 UI**: 마이크 안내 오버레이, 블러 처리, 폰트(`Eulyoo1945`)를 활용해 방문객에게 직관적인 피드백을 제공합니다.

---

## 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| 프레임워크 | React 19, Vite 7 |
| 언어 | JavaScript (ESM) |
| 스타일 | CSS, Tailwind CSS 구성 포함 |
| 빌드/품질 | Vite, ESLint 9 |
| 브라우저 API | Web Speech API, Web Audio API, Canvas API, DOMParser, DOMMatrix, LocalStorage |

---

## 시스템 요구 사항

- **브라우저**: Chrome 90+, Chromium 기반 브라우저 권장 (HTTPS 또는 `localhost` 필요)
- **OS**: macOS / Windows / Linux (마이크 접근 권한 필요)
- **Node.js**: v18 이상 추천
- **패키지 매니저**: `pnpm` 권장 (npm, yarn 사용도 가능)

---

## 설치 및 실행

```bash
pnpm install        # 의존성 설치
pnpm run dev        # 개발 서버 (기본 포트 5173)
pnpm run build      # 프로덕션 번들 생성
pnpm run preview    # 빌드 결과 미리보기
pnpm run lint       # ESLint 검사
```


---

## 디렉터리 구조

```text
my-vite-react-app/
├── public/
│   ├── flower.svg               # 텍스트를 담을 꽃 경로
│   ├── Eulyoo1945-Regular.*     # 한글 감성 폰트
│   └── mic.png                  # 오버레이 마이크 아이콘
├── src/
│   ├── App.jsx                  # 최상위 컴포넌트
│   ├── App.css                  # 전체 레이아웃 기본 스타일
│   ├── index.css                # 폰트 선언 및 Tailwind 지시어
│   ├── main.jsx                 # React 진입점
│   ├── constants/
│   │   └── appConstants.js      # 앱 전역에서 쓰는 상수 모음
│   ├── utils/
│   │   └── flowerUtils.js       # SVG/캔버스 관련 유틸리티
│   └── components/
│       └── InteractiveCanvas.jsx# 음성 인식 + 캔버스 핵심 로직
├── package.json
├── pnpm-lock.yaml
├── README.md
└── vite.config.js
```

---

## 핵심 동작 개요

1. **대기(idle)**: AudioContext를 통해 주변 볼륨을 주기적으로 확인.
2. **인식(listening)**: 임계값을 넘으면 Web Speech API를 연속 모드로 시작, interim/final 결과를 수집.
3. **결과 표시(done)**: 최종 문장을 오버레이로 보여주고 일정 시간 후 캔버스 렌더링 요청.
4. **렌더링(rendering)**: 꽃 경로에 누적 텍스트를 하단부터 채워 넣고 페이드 애니메이션 적용.
5. **복귀**: 애니메이션 종료 및 2초 대기 후 다시 `idle` 상태로 전환.

---

## 세부 구현

### 1. 음성 인식 파이프라인
- `startListening()`에서 Web Speech API 인스턴스를 생성하고 `continuous`, `interimResults`를 활성화합니다.
- `recognition.onresult`에서 interim과 final 결과 모두 침묵 타이머를 리셋하여 말이 잠시 끊겨도 세션이 이어집니다.
- `SILENCE_TIMEOUT_MS`(기본 1000ms) 동안 볼륨 변화가 없으면 `finalizeRecognition()`이 모든 세그먼트를 하나로 합쳐 캔버스에 전달합니다.

### 2. 오디오 볼륨 감지
- `setupAudioMonitoring()`이 최초 마운트 시 실행되어 `AudioContext`와 `AnalyserNode`를 초기화합니다.
- `getCurrentVolume()`은 FFT 데이터 평균을 기반으로 0~1 사이의 볼륨 값을 계산합니다.
- `idle` 상태에서 `setInterval`로 주기적 볼륨 체크를 수행하고, `VOLUME_THRESHOLD`(기본 0.02)를 넘으면 인식을 시작합니다.

### 3. 캔버스 렌더링
- `loadFlowerResources()`가 SVG를 파싱해 Path2D, Path 확대 배율, 이미지 객체를 한 번만 로드합니다.
- `willTextOverflow()`는 임시 캔버스에서 텍스트를 시뮬레이션해 넘칠 여부를 사전 판단합니다.
- `drawFrame()`이 실제 캔버스에 배경 꽃과 텍스트를 그리며, 새 글자에만 2.5초 페이드인 이asing을 적용합니다.

### 4. 상태 및 애니메이션 관리
- 상태 값은 `status`, `fadePhase`, `text`, `lastTranscript` 등으로 세분화했습니다.
- 페이드아웃 후 `handleCanvasTransitionEnd()`가 호출되어 누적 텍스트를 초기화하고 새 문장을 하단부터 렌더링합니다.
- 애니메이션 진행 여부는 `newTextAnimationRef`로 추적하며, 완료 시 idle 타이머를 설정합니다.

### 5. 데이터 영속성
- 텍스트 배열은 `localStorage`에 JSON 형태로 저장되고, 빈 배열이 되면 항목을 삭제합니다.
- 사용자가 새로고침해도 꽃 캔버스에는 기존 메시지가 그대로 남습니다.

---

## 전시/운영 가이드

1. **마이크 권한**: Chrome에서 최초 접속 시 마이크 접근을 허용해야 합니다.
2. **전시 준비**:
   - `pnpm run build` 후 정적 호스팅 또는 `pnpm run preview`로 HTTPS 환경에서 제공
   - 전시 현장의 평균 소음에 맞춰 `VOLUME_THRESHOLD`를 미세 조정 (예: 조용한 공간 0.015, 시끄러운 공간 0.03)
   - `SILENCE_TIMEOUT_MS`를 1000~2000ms 범위에서 조정해 말의 텀을 허용
3. **개발자 도구 확인**: `localStorage.getItem('flowerText')`로 누적 텍스트 확인 가능
4. **클린업**: 컴포넌트 언마운트 시 오디오 스트림, 인터벌, 타임아웃을 모두 정리하여 메모리 누수를 방지합니다.

---

## 품질 관리

- **Lint**: `pnpm run lint` 실행 시 ESLint 9 규칙을 기반으로 모든 파일이 검사됩니다.
- **브라우저 테스트**:
  - macOS Sonoma + Chrome 129 (HTTPS `localhost`)에서 확인
  - 음성 인식 세션이 연속으로 이어지는지, 캔버스 애니메이션이 끊김이 없는지 체크
- **디버그 팁**:
  - 필요 시 `VOLUME_THRESHOLD`를 0에 가깝게 낮춰 마이크 입력 여부를 확인
  - `newTextAnimationRef` 상태를 console로 출력해 애니메이션 진행도를 점검

---

## 향후 개선 아이디어

- 방문객이 자신의 문장을 확인할 수 있는 히스토리 UI 추가
- 텍스트가 가득 찬 후 기존 내용을 PDF/이미지로 백업한 뒤 초기화하는 기능
- 다국어 음성 인식 지원 (언어 선택 UI, 다국어 폰트 로딩)
- 백엔드 연동을 통한 데이터 아카이빙 및 관리자 페이지 구축

---

## 트러블슈팅 로그

| 이슈 | 증상 | 해결 방법 |
| --- | --- | --- |
| 음성 인식 1회 후 중단 | 첫 번째 문장이 렌더링된 뒤 `status`가 `rendering` 상태에서 `idle`로 돌아가지 않아 마이크가 재활성화되지 않음 | 페이드 애니메이션 완료 시 `animationFrameRef`가 `null`로 초기화되지 않아 타이머가 설정되지 않는 것을 발견하고, 애니메이션 완료 블록에서 `cancelAnimationFrame` 호출 후 참조를 `null`로 재설정. 이후 idle 타이머가 정상 작동함 |
| 볼륨 임계값 0 설정 | 전시 환경 테스트에서 `VOLUME_THRESHOLD = 0.00`으로 두면 인식이 곧바로 종료되거나 무한 대기 | 현실적인 최소값(0.01~0.02)을 유지하도록 README 및 상수 파일에 명시하고, 임계값 조정 가이드를 추가 |
| 침묵 감지 미작동 | 사용자가 말하다 중간에 숨을 고를 때 바로 세션이 종료되어 문장이 나눠짐 | `SILENCE_TIMEOUT_MS`를 도입하고, interim/final 이벤트가 올 때마다 타이머를 리셋하도록 `resetSilenceTimer()` 구현 |
| 전시 환경 잡음 문제 | 주변 소음 때문에 대기 상태에서도 계속 인식이 시작됨 | Web Audio API 기반 볼륨 체크 로직을 추가하고, 환경에 따라 조정 가능한 `VOLUME_THRESHOLD` 설명 제공 |
| 캔버스 페이드 전환 지연 | 꽃이 가득 찬 뒤 새 문장으로 전환 시 페이드 아웃 이후 화면이 멈춘 듯 보임 | `handleCanvasTransitionEnd()`에서 새 텍스트를 즉시 세팅하고 `fadePhase`를 `in`으로 전환하여 연속적인 페이드 인/아웃 흐름을 보장 |
| 상수/유틸리티 관리 | 여러 파일에 하드코딩된 값과 함수로 유지보수가 어려움 | `src/constants/appConstants.js`, `src/utils/flowerUtils.js`로 분리하고 모든 파일에 JSDoc을 추가해 IDE 자동완성을 강화 |

---


import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FONT_SIZE_PX,
  LINE_HEIGHT_PX,
  RESULT_DISPLAY_DELAY_MS,
  CANVAS_FADE_DURATION_MS,
  RENDER_IDLE_DELAY_MS,
  NEW_TEXT_FADE_DURATION_MS,
  SILENCE_TIMEOUT_MS,
  VOLUME_THRESHOLD,
  VOLUME_CHECK_INTERVAL_MS,
} from "../constants/appConstants";
import { loadFlowerResources, willTextOverflow } from "../utils/flowerUtils";

/**
 * 음성 인식 기반 인터랙티브 캔버스 컴포넌트
 * 사용자의 음성을 인식하여 꽃 모양 내부에 텍스트를 렌더링합니다.
 * @returns {JSX.Element} 인터랙티브 캔버스 컴포넌트
 */
export default function InteractiveCanvas() {
  const canvasRef = useRef(null);
  const [text, setText] = useState(() => {
    const savedText = localStorage.getItem("flowerText");
    return savedText ? JSON.parse(savedText) : [];
  });
  /**
   * 컴포넌트 상태
   * @type {"idle" | "listening" | "done" | "rendering" | "clearing"}
   */
  const [status, setStatus] = useState("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  /**
   * 페이드 애니메이션 단계
   * @type {"idle" | "out" | "in"}
   */
  const [fadePhase, setFadePhase] = useState("idle");

  const recognitionRef = useRef(null);
  const resultTimerRef = useRef(null);
  const textRef = useRef(text);
  const pendingTranscriptRef = useRef(null);
  const previousCharCountRef = useRef(0);
  const animationFrameRef = useRef(null);
  const newTextAnimationRef = useRef({
    active: false,
    startTime: null,
    duration: NEW_TEXT_FADE_DURATION_MS,
  });
  const silenceTimerRef = useRef(null);
  const collectedTranscriptsRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const volumeCheckIntervalRef = useRef(null);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    if (text.length > 0) {
      localStorage.setItem("flowerText", JSON.stringify(text));
    } else {
      localStorage.removeItem("flowerText");
    }
  }, [text]);

  const clearResultTimer = useCallback(() => {
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearResultTimer();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (volumeCheckIntervalRef.current) {
        clearInterval(volumeCheckIntervalRef.current);
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    },
    [clearResultTimer],
  );

  /**
   * 오디오 모니터링 설정
   * 마이크 입력의 볼륨을 측정하기 위한 Web Audio API 설정
   */
  const setupAudioMonitoring = useCallback(async () => {
    if (audioContextRef.current) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
    } catch (error) {
      console.error("Failed to setup audio monitoring:", error);
    }
  }, []);

  /**
   * 현재 마이크 입력 볼륨 측정
   * @returns {number} 0.0 ~ 1.0 범위의 정규화된 볼륨 값
   */
  const getCurrentVolume = useCallback(() => {
    if (!analyserRef.current) {
      return 0;
    }

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    return average / 255;
  }, []);

  /**
   * 인식된 트랜스크립트 처리
   * 텍스트 오버플로우 확인 후 캔버스 초기화 또는 렌더링 수행
   * @param {string} transcript - 인식된 텍스트
   */
  const handleTranscript = useCallback(
    async (transcript) => {
      clearResultTimer();
      if (!transcript) {
        setStatus("idle");
        return;
      }

      try {
        const candidate = [...textRef.current, transcript];
        const overflow = await willTextOverflow(candidate);

        if (overflow) {
          pendingTranscriptRef.current = transcript;
          setFadePhase("out");
          setStatus("clearing");
        } else {
          pendingTranscriptRef.current = null;
          const previousFullText = textRef.current.join(" ");
          previousCharCountRef.current = previousFullText.length;
          newTextAnimationRef.current = {
            active: true,
            startTime: null,
            duration: NEW_TEXT_FADE_DURATION_MS,
          };
          setText(() => {
            textRef.current = candidate;
            return candidate;
          });
          setFadePhase("idle");
          setStatus("rendering");
        }
      } catch (error) {
        console.error("Failed to process transcript", error);
        setStatus("idle");
      }
    },
    [clearResultTimer],
  );

  /**
   * 음성 인식 최종 처리
   * 수집된 모든 트랜스크립트를 결합하여 처리
   */
  const finalizeRecognition = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const fullTranscript = collectedTranscriptsRef.current.join(" ").trim();
    collectedTranscriptsRef.current = [];

    if (fullTranscript) {
      setLastTranscript(fullTranscript);
      setStatus("done");
      clearResultTimer();
      resultTimerRef.current = setTimeout(() => {
        handleTranscript(fullTranscript);
      }, RESULT_DISPLAY_DELAY_MS);
    } else {
      setStatus("idle");
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
  }, [clearResultTimer, handleTranscript]);

  /**
   * 침묵 타이머 리셋
   * 음성이 감지될 때마다 호출되어 타이머를 다시 시작
   */
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      finalizeRecognition();
    }, SILENCE_TIMEOUT_MS);
  }, [finalizeRecognition]);

  /**
   * 음성 인식 시작
   * Web Speech API를 사용하여 연속 음성 인식 시작
   */
  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    collectedTranscriptsRef.current = [];

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.lang = "ko-KR";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onspeechstart = () => {
        setStatus("listening");
        resetSilenceTimer();
      };

      recognition.onresult = (event) => {
        const lastResultIndex = event.results.length - 1;
        const result = event.results[lastResultIndex];
        const transcript = result[0].transcript.trim();
        
        if (result.isFinal && transcript) {
          collectedTranscriptsRef.current.push(transcript);
          resetSilenceTimer();
        } else if (!result.isFinal && transcript) {
          resetSilenceTimer();
        }
      };

      recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.error("Speech recognition error", event.error);
        }
        
        if (collectedTranscriptsRef.current.length > 0) {
          finalizeRecognition();
        }
      };

      recognition.onend = () => {
        setStatus((current) => (current === "listening" ? "idle" : current));
      };

      recognitionRef.current = recognition;
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      if (error.name !== "InvalidStateError") {
        console.error("Speech recognition could not be started", error);
        setStatus("idle");
      }
    }
  }, [resetSilenceTimer, finalizeRecognition]);

  /**
   * 컴포넌트 마운트 시 오디오 모니터링 초기화
   */
  useEffect(() => {
    setupAudioMonitoring();
  }, [setupAudioMonitoring]);

  /**
   * 볼륨 모니터링 및 임계값 초과 시 음성 인식 시작
   */
  useEffect(() => {
    if (status === "idle") {
      if (volumeCheckIntervalRef.current) {
        clearInterval(volumeCheckIntervalRef.current);
      }

      volumeCheckIntervalRef.current = setInterval(() => {
        const volume = getCurrentVolume();
        if (volume >= VOLUME_THRESHOLD) {
          clearInterval(volumeCheckIntervalRef.current);
          volumeCheckIntervalRef.current = null;
          startListening();
        }
      }, VOLUME_CHECK_INTERVAL_MS);

      return () => {
        if (volumeCheckIntervalRef.current) {
          clearInterval(volumeCheckIntervalRef.current);
          volumeCheckIntervalRef.current = null;
        }
      };
    }
  }, [getCurrentVolume, startListening, status]);

  /**
   * 캔버스 렌더링 및 애니메이션 처리
   */
  useEffect(() => {
    if (status !== "idle" && status !== "rendering") {
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    let cancelled = false;
    let idleTimer = null;

    /**
     * Ease-out 애니메이션 함수
     * @param {number} t - 0.0 ~ 1.0 범위의 시간 진행도
     * @returns {number} 애니메이션 진행률
     */
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    /**
     * 캔버스 프레임 그리기
     * @param {Object} resources - 꽃 리소스 객체
     */
    const drawFrame = (resources) => {
      if (cancelled) return;

      const { image, expandedPath, originalPath, flowerWidth, flowerHeight } = resources;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = flowerWidth;
      canvas.height = flowerHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.drawImage(image, 0, 0, flowerWidth, flowerHeight);
      ctx.restore();

      if (text.length > 0) {
        ctx.save();
        ctx.clip(originalPath);
        ctx.font = `${FONT_SIZE_PX}px Eulyoo1945`;
        ctx.fillStyle = "#1a1a1a";

        const fullText = text.join(" ");
        const characters = fullText.split("");
        const previousCount = Math.min(previousCharCountRef.current, characters.length);

        const animationState = newTextAnimationRef.current;
        let progress = 1;
        let alphaForNewChars = 1;

        if (animationState.active) {
          if (animationState.startTime == null) {
            animationState.startTime = performance.now();
          }
          const now = performance.now();
          progress = Math.min(1, (now - animationState.startTime) / animationState.duration);
          alphaForNewChars = easeOut(progress);
        }

        let charIndex = 0;

        for (let y = canvas.height - LINE_HEIGHT_PX; y >= 0 && charIndex < characters.length; y -= LINE_HEIGHT_PX) {
          let x = 0;
          let inPath = false;
          let startX = 0;
          const ranges = [];

          while (x < canvas.width) {
            const inside = ctx.isPointInPath(expandedPath, x, y);
            if (inside && !inPath) {
              startX = x;
              inPath = true;
            } else if (!inside && inPath) {
              ranges.push([startX, x]);
              inPath = false;
            }
            x += 1;
          }
          if (inPath) {
            ranges.push([startX, canvas.width]);
          }

          for (const [xStart, xEnd] of ranges) {
            let currX = xStart;
            while (charIndex < characters.length && currX < xEnd) {
              const ch = characters[charIndex];
              const width = ctx.measureText(ch).width;
              if (currX + width > xEnd) {
                break;
              }
              const isNewChar = charIndex >= previousCount;
              ctx.globalAlpha = isNewChar && animationState.active ? alphaForNewChars : 1;
              ctx.fillText(ch, currX, y);
              currX += width;
              charIndex += 1;
            }
            if (charIndex >= characters.length) {
              break;
            }
          }
        }

        ctx.restore();
        ctx.globalAlpha = 1;

        if (animationState.active && progress < 1) {
          animationFrameRef.current = requestAnimationFrame(() => drawFrame(resources));
          return;
        }

        if (animationState.active && progress >= 1) {
          animationState.active = false;
          animationState.startTime = null;
          previousCharCountRef.current = characters.length;
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        }
      }

      if (status === "rendering") {
        const stillAnimating = newTextAnimationRef.current.active;
        
        if (!stillAnimating && !animationFrameRef.current) {
          idleTimer = setTimeout(() => {
            setStatus("idle");
          }, RENDER_IDLE_DELAY_MS);
        }
      }
    };

    loadFlowerResources()
      .then((resources) => {
        if (!cancelled) {
          drawFrame(resources);
        }
      })
      .catch((error) => {
        console.error("Failed to render flower canvas", error);
        if (status !== "idle") {
          setStatus("idle");
        }
      });

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
    };
  }, [status, text]);

  /**
   * 캔버스 페이드 트랜지션 완료 처리
   * 페이드아웃 후 새 텍스트로 교체하고 페이드인 시작
   */
  const handleCanvasTransitionEnd = useCallback(() => {
    if (fadePhase === "out") {
      const pending = pendingTranscriptRef.current;
      pendingTranscriptRef.current = null;
      previousCharCountRef.current = 0;
      newTextAnimationRef.current = {
        active: true,
        startTime: null,
        duration: NEW_TEXT_FADE_DURATION_MS,
      };
      const nextText = pending ? [pending] : [];
      setText(() => {
        textRef.current = nextText;
        return nextText;
      });
      setFadePhase("in");
      setStatus("rendering");
    } else if (fadePhase === "in") {
      setFadePhase("idle");
    }
  }, [fadePhase]);

  const showOverlay = status === "listening" || status === "done";
  const canvasOpacity = fadePhase === "out" ? 0 : 1;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        backgroundColor: "#FFFFFF",
      }}
    >
      <div
        style={{
          transition: "filter 0.5s ease-in-out",
          filter: showOverlay ? "blur(0.74vmin)" : "none",
        }}
      >
        <canvas
          ref={canvasRef}
          onTransitionEnd={handleCanvasTransitionEnd}
          style={{
            width: "67.6vmin",
            height: "auto",
            display: "block",
            opacity: canvasOpacity,
            transition: `opacity ${CANVAS_FADE_DURATION_MS / 1000}s ease`,
          }}
        />
        {/* 730px -> 67.6vmin */}
      </div>

      {showOverlay && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
          }}
        >
          {status === "listening" ? (
            <>
              <img
                src="/mic.png"
                alt="mic"
                style={{ width: "4.44vmin", marginBottom: "1.85vmin" }}
              />
              <p style={{ fontSize: "3.33vmin", color: "#333", fontFamily: "Eulyoo1945" }}>
                방명록을 남겨주세요.
              </p>
            </>
          ) : (
            <>
              <p
                style={{
                  fontSize: "4.44vmin",
                  marginBottom: "2.78vmin",
                  maxWidth: "55.56vmin",
                  lineHeight: 1.5,
                  color: "#333",
                  padding: "0 1.85vmin",
                  fontFamily: "Eulyoo1945",
                }}
              >
                {lastTranscript}
              </p>
              <img src="/mic.png" alt="mic" style={{ width: "3.33vmin" }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
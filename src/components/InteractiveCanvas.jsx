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
  RECOGNITION_RESTART_DELAY_MS,
  RECOGNITION_MAX_RETRIES,
  RENDER_IDLE_WATCHDOG_MS,
  AUDIO_HEALTH_CHECK_INTERVAL_MS,
  MIC_RECOVERY_BACKOFF_MS,
} from "../constants/appConstants";
import { loadFlowerResources, willTextOverflow } from "../utils/flowerUtils";

const LOG_PREFIX = "[InteractiveCanvas]";
const log = (...args) => console.log(LOG_PREFIX, ...args);
const warn = (...args) => console.warn(LOG_PREFIX, ...args);
const errorLog = (...args) => console.error(LOG_PREFIX, ...args);

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
  const recognitionActiveRef = useRef(false);
  const pendingRecognitionStartRef = useRef(false);
  const statusRef = useRef("idle");
  const silenceTimerRef = useRef(null);
  const collectedTranscriptsRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const volumeCheckIntervalRef = useRef(null);
  const recognitionRetryCountRef = useRef(0);
  const recognitionRestartTimeoutRef = useRef(null);
  const startListeningRef = useRef(null);
  const statusWatchdogRef = useRef(null);
  const audioHealthIntervalRef = useRef(null);
  const audioRecoveryTimeoutRef = useRef(null);
  const audioHealthCheckRunningRef = useRef(false);

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

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearResultTimer = useCallback(() => {
    if (resultTimerRef.current) {
      log("Clearing result timer");
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  const disposeAudioResources = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clearResultTimer();
      log("Component unmount: clearing timers and audio resources");
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (volumeCheckIntervalRef.current) {
        clearInterval(volumeCheckIntervalRef.current);
      }
      if (statusWatchdogRef.current) {
        clearTimeout(statusWatchdogRef.current);
      }
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
      }
      if (audioHealthIntervalRef.current) {
        clearInterval(audioHealthIntervalRef.current);
      }
      if (audioRecoveryTimeoutRef.current) {
        clearTimeout(audioRecoveryTimeoutRef.current);
      }
      disposeAudioResources();
    },
    [clearResultTimer, disposeAudioResources],
  );

  /**
   * 오디오 모니터링 설정
   * 마이크 입력의 볼륨을 측정하기 위한 Web Audio API 설정
   */
  const reinitializeAudioMonitoring = useCallback(async () => {
    disposeAudioResources();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      log("Audio stream acquired");
      micStreamRef.current = stream;

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          warn("Microphone track ended unexpectedly. Scheduling recovery.");
          if (audioRecoveryTimeoutRef.current) {
            return;
          }
          audioRecoveryTimeoutRef.current = setTimeout(() => {
            audioRecoveryTimeoutRef.current = null;
            reinitializeAudioMonitoring();
          }, MIC_RECOVERY_BACKOFF_MS);
        };
      });

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
      errorLog("Failed to reinitialize audio monitoring:", error);
    }
  }, [disposeAudioResources]);

  const setupAudioMonitoring = useCallback(async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === "suspended") {
        try {
          await audioContextRef.current.resume();
        } catch (resumeError) {
          warn("AudioContext resume failed, rebuilding resources.", resumeError);
          await reinitializeAudioMonitoring();
        }
      }
      return;
    }

    await reinitializeAudioMonitoring();
  }, [reinitializeAudioMonitoring]);

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
        log("Received empty transcript, returning to idle");
        setStatus("idle");
        return;
      }

      log("Handling transcript:", transcript);

      try {
        const candidate = [...textRef.current, transcript];
        const overflow = await willTextOverflow(candidate);

        if (overflow) {
          log("Canvas overflow detected. Pending transcript stored.");
          pendingTranscriptRef.current = transcript;
          setFadePhase("out");
          setStatus("clearing");
        } else {
          log("Appending transcript to canvas", transcript);
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
        errorLog("Failed to process transcript", error);
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
      log("Clearing silence timer in finalizeRecognition");
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const fullTranscript = collectedTranscriptsRef.current.join(" ").trim();
    log("Finalize recognition with transcript:", fullTranscript);
    collectedTranscriptsRef.current = [];

    if (fullTranscript) {
      setLastTranscript(fullTranscript);
      setStatus("done");
      clearResultTimer();
      resultTimerRef.current = setTimeout(() => {
        log("Scheduling transcript render after delay");
        handleTranscript(fullTranscript);
      }, RESULT_DISPLAY_DELAY_MS);
    } else {
      log("No transcript collected. Returning to idle");
      setStatus("idle");
    }

    if (recognitionRef.current && recognitionActiveRef.current) {
      try {
        log("Stopping recognition session from finalizeRecognition");
        recognitionRef.current.stop();
      } catch {
        warn("Failed to stop recognition (already stopped)");
      }
    } else {
      log("Recognition already stopped when finalizeRecognition executed");
    }
  }, [clearResultTimer, handleTranscript]);

  /**
   * 침묵 타이머 리셋
   * 음성이 감지될 때마다 호출되어 타이머를 다시 시작
   */
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      log("Resetting existing silence timer");
      clearTimeout(silenceTimerRef.current);
    }
    log("Starting silence timer", SILENCE_TIMEOUT_MS, "ms");
    silenceTimerRef.current = setTimeout(() => {
      finalizeRecognition();
    }, SILENCE_TIMEOUT_MS);
  }, [finalizeRecognition]);

  /**
   * 음성 인식 시작
   * Web Speech API를 사용하여 연속 음성 인식 시작
   */
  const requestRecognitionRestart = useCallback(
    (reason) => {
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
      }

      if (recognitionRetryCountRef.current >= RECOGNITION_MAX_RETRIES) {
        warn(
          "Reached maximum recognition restart attempts. Waiting for fresh signal.",
          reason,
        );
        recognitionRetryCountRef.current = 0;
        recognitionRestartTimeoutRef.current = null;
        return;
      }

      recognitionRetryCountRef.current += 1;
      pendingRecognitionStartRef.current = true;

      recognitionRestartTimeoutRef.current = setTimeout(() => {
        recognitionRestartTimeoutRef.current = null;
        if (statusRef.current === "idle" && !recognitionActiveRef.current) {
          if (startListeningRef.current) {
            log("Restarting recognition after error", reason);
            startListeningRef.current();
            return;
          }
        }
        warn(
          "Recognition restart deferred because status is not idle",
          statusRef.current,
        );
        pendingRecognitionStartRef.current = true;
      }, RECOGNITION_RESTART_DELAY_MS);
    },
    [],
  );

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      errorLog("SpeechRecognition API not available");
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    if (recognitionActiveRef.current) {
      warn("Recognition already active. Deferring new start request");
      pendingRecognitionStartRef.current = true;
      return;
    }

    if (silenceTimerRef.current) {
      log("Clearing pending silence timer before starting new session");
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    collectedTranscriptsRef.current = [];
    log("Starting new recognition session");

    if (!recognitionRef.current) {
      log("Creating new SpeechRecognition instance");
      const recognition = new SpeechRecognition();
      recognition.lang = "ko-KR";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onspeechstart = () => {
        log("Speech detected - switching to listening state");
        setStatus("listening");
        resetSilenceTimer();
      };

      recognition.onresult = (event) => {
        const lastResultIndex = event.results.length - 1;
        const result = event.results[lastResultIndex];
        const transcript = result[0].transcript.trim();
        log(
          "Recognition result",
          result.isFinal ? "final" : "interim",
          "transcript:",
          transcript,
        );
        
        if (result.isFinal && transcript) {
          collectedTranscriptsRef.current.push(transcript);
          log("Stored final transcript segment", transcript);
          resetSilenceTimer();
        } else if (!result.isFinal && transcript) {
          log("Interim transcript segment", transcript);
          resetSilenceTimer();
        }
      };

      recognition.onerror = (event) => {
        if (event.error === "aborted") {
          log("Recognition aborted by stop()");
          recognitionActiveRef.current = false;
          setStatus((current) => (current === "listening" ? "idle" : current));
          return;
        }

        recognitionActiveRef.current = false;

        const fatalErrors = new Set([
          "network",
          "not-allowed",
          "service-not-allowed",
          "audio-capture",
        ]);

        if (event.error === "no-speech") {
          warn("No speech detected during recognition session");
          pendingRecognitionStartRef.current = true;
        } else {
          errorLog("Speech recognition error", event.error);
        }

        if (fatalErrors.has(event.error)) {
          warn("Fatal recognition error detected. Clearing instance.");
          recognitionRef.current = null;
        }

        finalizeRecognition();
        requestRecognitionRestart(event.error);
      };

      recognition.onend = () => {
        recognitionActiveRef.current = false;
        if (collectedTranscriptsRef.current.length > 0) {
          log("Recognition ended with pending transcripts. Finalizing now.");
          finalizeRecognition();
          return;
        }
        setStatus((current) => {
          log("Recognition ended - previous status", current);
          return current === "listening" ? "idle" : current;
        });
        if (pendingRecognitionStartRef.current && statusRef.current === "idle") {
          log("Processing deferred recognition start");
          pendingRecognitionStartRef.current = false;
          setTimeout(() => {
            startListening();
          }, 0);
        }
      };

      recognitionRef.current = recognition;
    }

    try {
      recognitionRef.current.start();
      recognitionActiveRef.current = true;
      pendingRecognitionStartRef.current = false;
      recognitionRetryCountRef.current = 0;
      log("SpeechRecognition.start() invoked");
    } catch (error) {
      recognitionActiveRef.current = false;
      if (error.name !== "InvalidStateError") {
        errorLog("Speech recognition could not be started", error);
        setStatus("idle");
        requestRecognitionRestart(error.name);
      } else {
        warn("SpeechRecognition.start() ignored: already running");
      }
    }
  }, [resetSilenceTimer, finalizeRecognition, requestRecognitionRestart]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  /**
   * 컴포넌트 마운트 시 오디오 모니터링 초기화
   */
  useEffect(() => {
    setupAudioMonitoring();
  }, [setupAudioMonitoring]);

  useEffect(() => {
    const performHealthCheck = async () => {
      if (audioHealthCheckRunningRef.current) {
        return;
      }
      audioHealthCheckRunningRef.current = true;
      try {
        const stream = micStreamRef.current;
        const hasLiveTrack =
          !!stream &&
          stream.getAudioTracks().some((track) => track.readyState === "live");

        if (!hasLiveTrack) {
          warn("No live microphone tracks detected. Reinitializing audio.");
          await reinitializeAudioMonitoring();
          return;
        }

        if (
          audioContextRef.current &&
          audioContextRef.current.state === "suspended"
        ) {
          try {
            await audioContextRef.current.resume();
            log("AudioContext resumed after suspension");
          } catch (resumeError) {
            warn(
              "Failed to resume AudioContext during health check. Rebuilding.",
              resumeError,
            );
            await reinitializeAudioMonitoring();
          }
        }
      } finally {
        audioHealthCheckRunningRef.current = false;
      }
    };

    performHealthCheck();
    audioHealthIntervalRef.current = setInterval(() => {
      performHealthCheck();
    }, AUDIO_HEALTH_CHECK_INTERVAL_MS);

    return () => {
      if (audioHealthIntervalRef.current) {
        clearInterval(audioHealthIntervalRef.current);
        audioHealthIntervalRef.current = null;
      }
    };
  }, [reinitializeAudioMonitoring]);

  /**
   * 볼륨 모니터링 및 임계값 초과 시 음성 인식 시작
   */
  useEffect(() => {
    if (status === "idle") {
      log("Status=idle: starting volume monitor interval");
      if (volumeCheckIntervalRef.current) {
        clearInterval(volumeCheckIntervalRef.current);
      }

      volumeCheckIntervalRef.current = setInterval(() => {
        const volume = getCurrentVolume();
        log("Volume check", volume.toFixed(4));
        if (volume >= VOLUME_THRESHOLD) {
          log("Volume threshold exceeded", volume);
          clearInterval(volumeCheckIntervalRef.current);
          volumeCheckIntervalRef.current = null;
          startListening();
        }
      }, VOLUME_CHECK_INTERVAL_MS);

      return () => {
        if (volumeCheckIntervalRef.current) {
          log("Clearing volume monitor interval");
          clearInterval(volumeCheckIntervalRef.current);
          volumeCheckIntervalRef.current = null;
        }
      };
    }
  }, [getCurrentVolume, startListening, status]);

  useEffect(() => {
    if (
      status === "idle" &&
      pendingRecognitionStartRef.current &&
      !recognitionActiveRef.current
    ) {
      pendingRecognitionStartRef.current = false;
      startListening();
    }
  }, [status, startListening]);

  useEffect(() => {
    if (statusWatchdogRef.current) {
      clearTimeout(statusWatchdogRef.current);
      statusWatchdogRef.current = null;
    }

    if (status === "idle") {
      return;
    }

    statusWatchdogRef.current = setTimeout(() => {
      warn("Status watchdog forcing idle transition", statusRef.current);
      setStatus("idle");
    }, RENDER_IDLE_WATCHDOG_MS);

    return () => {
      if (statusWatchdogRef.current) {
        clearTimeout(statusWatchdogRef.current);
        statusWatchdogRef.current = null;
      }
    };
  }, [status]);

  /**
   * 캔버스 렌더링 및 애니메이션 처리
   */
  useEffect(() => {
    if (status !== "idle" && status !== "rendering") {
      return;
    }

    log("Render effect running with status", status, "text length", text.length);

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

      log("Drawing frame", { status, fadePhase, textLength: text.length });

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
          log("Scheduling idle transition after rendering");
          idleTimer = setTimeout(() => {
            log("Idle transition timer fired");
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
        log("Cancelling pending animation frame in cleanup");
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (idleTimer) {
        log("Clearing idle transition timer in cleanup");
        clearTimeout(idleTimer);
      }
    };
  }, [status, text, fadePhase]);

  /**
   * 캔버스 페이드 트랜지션 완료 처리
   * 페이드아웃 후 새 텍스트로 교체하고 페이드인 시작
   */
  const handleCanvasTransitionEnd = useCallback(() => {
    log("Canvas transition end", fadePhase);
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
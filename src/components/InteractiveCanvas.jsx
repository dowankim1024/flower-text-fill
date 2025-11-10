import React, { useCallback, useEffect, useRef, useState } from "react";

const FLOWER_SVG_URL = "/flower.svg";
const FLOWER_TARGET_WIDTH = 730;
const FLOWER_EXPANSION_SCALE = 1.05;
const FLOWER_OFFSET_X = 5;
const FONT_SIZE_PX = 15;
const LINE_HEIGHT_PX = 21;
const RESULT_DISPLAY_DELAY_MS = 1500;
const CANVAS_FADE_DURATION_MS = 800;
const RENDER_IDLE_DELAY_MS = 2000;
const NEW_TEXT_FADE_DURATION_MS = 3000;

let flowerResourcesPromise = null;

async function loadFlowerResources() {
  if (!flowerResourcesPromise) {
    flowerResourcesPromise = (async () => {
      const response = await fetch(FLOWER_SVG_URL);
      const svgText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, "image/svg+xml");
      const svgElement = doc.querySelector("svg");
      const pathData = doc.querySelector("path")?.getAttribute("d");
      if (!pathData) {
        throw new Error("No path found in SVG");
      }

      let baseWidth = 0;
      let baseHeight = 0;
      const viewBox = svgElement?.getAttribute("viewBox");
      if (viewBox) {
        const [, , width, height] = viewBox.trim().split(/\s+/).map(parseFloat);
        baseWidth = width;
        baseHeight = height;
      }

      const image = new Image();
      image.src = FLOWER_SVG_URL;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Failed to load flower image"));
      });

      if (!baseWidth || !baseHeight) {
        baseWidth = image.naturalWidth || image.width;
        baseHeight = image.naturalHeight || image.height;
      }

      const flowerWidth = FLOWER_TARGET_WIDTH;
      const flowerHeight = (baseHeight / baseWidth) * flowerWidth;

      const basePath = new Path2D(pathData);
      const scaleX = flowerWidth / baseWidth;
      const scaleY = flowerHeight / baseHeight;

      const expandedMatrix = new DOMMatrix()
        .scale(scaleX * FLOWER_EXPANSION_SCALE, scaleY * FLOWER_EXPANSION_SCALE)
        .translate(-FLOWER_OFFSET_X, 0);
      const expandedPath = new Path2D();
      expandedPath.addPath(basePath, expandedMatrix);

      const originalMatrix = new DOMMatrix().scale(scaleX, scaleY);
      const originalPath = new Path2D();
      originalPath.addPath(basePath, originalMatrix);

      return {
        image,
        flowerWidth,
        flowerHeight,
        expandedPath,
        originalPath,
      };
    })();
  }

  return flowerResourcesPromise;
}

async function willTextOverflow(textItems) {
  if (textItems.length === 0) {
    return false;
  }

  const { expandedPath, flowerWidth, flowerHeight } = await loadFlowerResources();
  const canvas = document.createElement("canvas");
  canvas.width = flowerWidth;
  canvas.height = flowerHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }

  ctx.font = `${FONT_SIZE_PX}px Eulyoo1945`;
  const fullText = textItems.join(" ");
  const characters = fullText.split("");
  let charIndex = 0;

  for (let y = flowerHeight - LINE_HEIGHT_PX; y >= 0 && charIndex < characters.length; y -= LINE_HEIGHT_PX) {
    let x = 0;
    let inPath = false;
    let startX = 0;
    const ranges = [];

    while (x < flowerWidth) {
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
      ranges.push([startX, flowerWidth]);
    }

    for (const [xStart, xEnd] of ranges) {
      let currX = xStart;
      while (charIndex < characters.length && currX < xEnd) {
        const width = ctx.measureText(characters[charIndex]).width;
        if (currX + width > xEnd) {
          break;
        }
        currX += width;
        charIndex += 1;
      }
      if (charIndex >= characters.length) {
        break;
      }
    }
  }

  return charIndex < characters.length;
}

export default function InteractiveCanvas() {
  const canvasRef = useRef(null);
  const [text, setText] = useState(() => {
    const savedText = localStorage.getItem("flowerText");
    return savedText ? JSON.parse(savedText) : [];
  });
  const [status, setStatus] = useState("idle"); // idle | listening | done | rendering | clearing
  const [lastTranscript, setLastTranscript] = useState("");
  const [fadePhase, setFadePhase] = useState("idle"); // idle | out | in

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

  useEffect(() => () => clearResultTimer(), [clearResultTimer]);

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

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.lang = "ko-KR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onspeechstart = () => {
        setStatus("listening");
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (!transcript) {
          return;
        }
        setLastTranscript(transcript);
        setStatus("done");
        clearResultTimer();
        resultTimerRef.current = setTimeout(() => {
          handleTranscript(transcript);
        }, RESULT_DISPLAY_DELAY_MS);
      };

      recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.error("Speech recognition error", event.error);
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
  }, [clearResultTimer, handleTranscript]);

  useEffect(() => {
    if (status === "idle") {
      const timer = setTimeout(startListening, 100);
      return () => clearTimeout(timer);
    }
  }, [startListening, status]);

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

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

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
        }
      }

      if (status === "rendering" && !animationFrameRef.current) {
        idleTimer = setTimeout(() => {
          setStatus("idle");
        }, RENDER_IDLE_DELAY_MS);
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
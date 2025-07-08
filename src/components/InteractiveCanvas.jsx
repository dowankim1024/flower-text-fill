import React, { useEffect, useRef, useState } from "react";

export default function InteractiveCanvas() {
  const canvasRef = useRef(null);
  const [text, setText] = useState([]); // Changed to array to accumulate texts
  const recognitionRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | listening | done | rendering

  // This function is now only for setting up and starting recognition
  const startListening = () => {
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

      // When the browser starts listening
      recognition.onspeechstart = () => {
        setStatus("listening");
      };

      // When a result is received
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setText((prevText) => [...prevText, transcript]); // Accumulate new text
        setStatus("done");

        setTimeout(() => {
          setStatus("rendering");
        }, 1500);
      };

      // On error
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") {
          console.log(`Speech recognition ended: ${event.error}`);
        } else {
          console.error("Speech recognition error", event.error);
        }
        // onend will be called which handles restarting.
      };

      // When recognition service ends
      recognition.onend = () => {
        // Automatically restart by transitioning to idle,
        // unless we are in the process of rendering the result.
        setStatus((currentStatus) => {
          if (currentStatus === "listening") {
            return "idle";
          }
          return currentStatus;
        });
      };

      recognitionRef.current = recognition;
    }

    try {
      // Start listening
      recognitionRef.current.start();
    } catch (error) {
      if (error.name !== "InvalidStateError") {
        console.error("Speech recognition could not be started", error);
        // Try to recover by going to idle
        setStatus("idle");
      }
    }
  };

  // Main component lifecycle effect for voice recognition
  useEffect(() => {
    // Start listening when the component is in 'idle' state
    if (status === "idle") {
      const timer = setTimeout(startListening, 100);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Effect for rendering the canvas
  useEffect(() => {
    // Redraw the canvas only when idle (to clear previous text) or when rendering new text.
    // Also redraw when text changes to update the accumulated text on canvas.
    if (status !== "idle" && status !== "rendering") {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const svgUrl = "/flower.svg";

    fetch(svgUrl)
      .then((res) => res.text())
      .then((svgText) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const d = doc.querySelector("path")?.getAttribute("d");
        if (!d) {
          console.error("No path found in SVG");
          setStatus('idle'); // Go back to idle if svg fails
          return;
        }

        const img = new Image();
        img.src = svgUrl;
        img.onload = () => {
          const flowerWidth = 730;
          const flowerHeight = (img.height / img.width) * flowerWidth;

          const path = new Path2D();
          // Calculate scaling factors based on the SVG's intrinsic size (from viewBox)
          // and the desired canvas size.
          // img.width and img.height will reflect the intrinsic dimensions of the SVG (310.53, 409.35)
          const scaleX = flowerWidth / img.width;
          const scaleY = flowerHeight / img.height;
          const matrix = new DOMMatrix().scale(scaleX, scaleY);
          path.addPath(new Path2D(d), matrix);

          canvas.width = flowerWidth;
          canvas.height = flowerHeight;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, flowerWidth, flowerHeight);

          // Draw all accumulated text
          if (text.length > 0) {
            ctx.font = "15px Eulyoo1945";
            ctx.fillStyle = "#1a1a1a";

            const fullText = text.join(" "); // Combine all accumulated texts
            const characters = fullText.split("");
            const lineHeight = 21; // 140% of 15px (15 * 1.4 = 21)
            let charIndex = 0;

            // Start drawing from the bottom of the canvas
            let y = canvas.height - lineHeight;

            // Loop downwards from the bottom of the canvas
            while (y >= 0 && charIndex < characters.length) {
              let x = 0;
              let inPath = false;
              let startX = 0;
              const ranges = [];

              // Find horizontal ranges within the path for the current y
              while (x < canvas.width) {
                const inside = ctx.isPointInPath(path, x, y);
                if (inside && !inPath) {
                  startX = x;
                  inPath = true;
                } else if (!inside && inPath) {
                  ranges.push([startX, x]);
                  inPath = false;
                }
                x++;
              }
              if (inPath) ranges.push([startX, canvas.width]);

              // Fill characters into the found ranges
              for (const [xStart, xEnd] of ranges) {
                let currX = xStart;
                while (charIndex < characters.length && currX < xEnd) {
                  const ch = characters[charIndex];
                  const width = ctx.measureText(ch).width;
                  if (currX + width > xEnd) break;
                  ctx.fillText(ch, currX, y);
                  currX += width;
                  charIndex++;
                }
                if (charIndex >= characters.length) break;
              }
              y -= lineHeight; // Move up for the next line
            }
          }

          // After rendering text, wait for a moment and then return to idle.
          // This allows the user to see the result before it resets.
          if (status === "rendering") {
            setTimeout(() => {
              setStatus("idle"); // This will trigger a re-render of the canvas with accumulated text.
            }, 2000);
          }
        };
        img.onerror = () => {
            console.error("Failed to load flower image.");
            setStatus('idle'); // Go back to idle if image fails
        }
      });
  }, [status, text]); // Dependency on text to redraw when accumulated text changes

  const isBlurred = status === "listening" || status === "done";

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
          filter: isBlurred ? "blur(8px)" : "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "730px", height: "auto", display: "block" }}
        />
      </div>

      {isBlurred && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
          }}
        >
          {status === "listening" && (
            <>
              <img
                src="/mic.png"
                alt="mic"
                style={{ width: "48px", marginBottom: "20px" }}
              />
              <p style={{ fontSize: "36px", color: "#333", fontFamily: "Eulyoo1945" }}>
                방명록을 남겨주세요.
              </p>
            </>
          )}

          {status === "done" && (
            <>
              <p
                style={{
                  fontSize: "48px",
                  marginBottom: "30px",
                  maxWidth: "600px",
                  lineHeight: 1.5,
                  color: "#333",
                  padding: "0 20px",
                  fontFamily: "Eulyoo1945",
                }}
              >
                {text.length > 0 ? text[text.length - 1].trim() : ""} {/* Display last recognized text */}
              </p>
              <img src="/mic.png" alt="mic" style={{ width: "36px" }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
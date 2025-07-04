import React, { useEffect, useRef, useState } from "react";

export default function InteractiveCanvas() {
  const canvasRef = useRef(null);
  const [text, setText] = useState("");
  const recognitionRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | listening | done | rendering

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = "ko-KR";
      recognitionRef.current.interimResults = false;
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setText((prev) => prev + " " + transcript);
        setStatus("done");

        setTimeout(() => {
          setStatus("rendering");
        }, 1500);
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setStatus("idle");
      };
    }

    setStatus("listening");
    recognitionRef.current.start();
  };

  useEffect(() => {
    if (status !== "rendering") return;

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
          return;
        }
        const path = new Path2D(d);

        const img = new Image();
        img.src = svgUrl;
        img.onload = () => {
          const flowerWidth = 730;
          const flowerHeight = (img.height / img.width) * flowerWidth;

          canvas.width = flowerWidth;
          canvas.height = flowerHeight;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, flowerWidth, flowerHeight);

          ctx.font = "6px sans-serif";
          ctx.fillStyle = "#1a1a1a";

          const characters = text.split("");
          const lineHeight = 8;
          let y = 6;
          let charIndex = 0;

          while (y < canvas.height && charIndex < characters.length) {
            let x = 0;
            let inPath = false;
            let startX = 0;
            const ranges = [];

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
            y += lineHeight;
          }

          setTimeout(() => {
            setStatus("idle");
          }, 2000);
        };
      });
  }, [status, text]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundImage: "url('/background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {status === "idle" && (
        <>
          <img
            src="/flower.svg"
            alt="flower"
            style={{ width: "730px", height: "auto", marginBottom: "30px" }}
          />
          <img
            src="/mic.png"
            alt="mic"
            onClick={startListening}
            style={{ width: "36px", cursor: "pointer" }}
          />
        </>
      )}

      {status === "listening" && (
        <>
          <img
            src="/mic.png"
            alt="mic"
            style={{ width: "48px", marginBottom: "10px" }}
          />
          <p style={{ color: "#333" }}>방명록을 남겨주세요..</p>
        </>
      )}

      {status === "done" && (
        <>
          <p
            style={{
              fontSize: "18px",
              textAlign: "center",
              color: "#222",
              marginBottom: "20px",
              maxWidth: "80%",
              lineHeight: 1.4,
            }}
          >
            {text.trim()}
          </p>
          <img src="/mic.png" alt="mic" style={{ width: "36px" }} />
        </>
      )}

      {status === "rendering" && (
        <canvas
          ref={canvasRef}
          style={{ width: "730px", height: "auto", display: "block" }}
        />
      )}
    </div>
  );
}
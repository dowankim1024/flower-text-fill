/**
 * 꽃 SVG 렌더링 및 텍스트 배치 유틸리티
 * @module flowerUtils
 */

import {
  FLOWER_SVG_URL,
  FLOWER_TARGET_WIDTH,
  FLOWER_EXPANSION_SCALE,
  FLOWER_OFFSET_X,
  FONT_SIZE_PX,
  LINE_HEIGHT_PX,
} from "../constants/appConstants";

/**
 * 로드된 꽃 리소스 캐시
 * @type {Promise|null}
 */
let flowerResourcesPromise = null;

/**
 * 꽃 SVG 리소스를 로드하고 캐싱합니다.
 * 한 번 로드된 리소스는 재사용됩니다.
 * @returns {Promise<{
 *   image: HTMLImageElement,
 *   flowerWidth: number,
 *   flowerHeight: number,
 *   expandedPath: Path2D,
 *   originalPath: Path2D
 * }>} 꽃 리소스 객체
 * @throws {Error} SVG에 path 요소가 없거나 이미지 로드 실패 시
 */
export async function loadFlowerResources() {
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

/**
 * 주어진 텍스트가 꽃 내부 영역을 넘치는지 확인합니다.
 * 임시 캔버스에 텍스트를 시뮬레이션하여 배치 가능 여부를 판단합니다.
 * @param {string[]} textItems - 확인할 텍스트 배열
 * @returns {Promise<boolean>} 텍스트가 넘치면 true, 모두 배치 가능하면 false
 */
export async function willTextOverflow(textItems) {
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


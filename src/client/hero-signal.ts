const TAU = Math.PI * 2;
const RING_COUNT = 9;

type SpringValue = {
  current: number;
  target: number;
  velocity: number;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

function updateSpring(spring: SpringValue, stiffness: number, damping: number, delta: number) {
  const acceleration = (spring.target - spring.current) * stiffness - spring.velocity * damping;
  spring.velocity += acceleration * delta;
  spring.current += spring.velocity * delta;
}

function isSettled(spring: SpringValue) {
  return Math.abs(spring.target - spring.current) < 0.001 && Math.abs(spring.velocity) < 0.001;
}

// A line looks identical after a half turn, so interpolate over PI instead of TAU.
function mixLineAngle(from: number, to: number, ratio: number) {
  const difference = ((to - from + Math.PI * 1.5) % Math.PI) - Math.PI / 2;
  return from + difference * ratio;
}

export function mountHeroSignal(canvas: HTMLCanvasElement | null) {
  if (!canvas || canvas.dataset.signalMounted === "true") return () => {};

  const context = canvas.getContext("2d");
  if (!context) return () => {};

  canvas.dataset.signalMounted = "true";

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointerX: SpringValue = { current: 0, target: 0, velocity: 0 };
  const pointerY: SpringValue = { current: 0, target: 0, velocity: 0 };
  const interaction: SpringValue = { current: 0, target: 0, velocity: 0 };
  const mountedAt = performance.now();
  let colors: string[] = [];
  let cssWidth = 0;
  let cssHeight = 0;
  let animationFrame = 0;
  let previousFrame = performance.now();
  let pointerInitialized = false;
  let revealProgress = reducedMotion.matches ? 1 : 0;
  let isIntersecting = true;
  let destroyed = false;

  const readColors = () => {
    const style = getComputedStyle(canvas);
    colors = Array.from({ length: 5 }, (_, index) => (
      style.getPropertyValue(`--signal-color-${index + 1}`).trim()
    ));
  };

  const draw = () => {
    context.clearRect(0, 0, cssWidth, cssHeight);
    if (!cssWidth || !cssHeight) return;

    const scale = clamp(cssWidth / 1000, 0.48, 0.8);
    const centerX = cssWidth / 2;
    const centerY = cssHeight * 0.56;
    const segmentSpacing = 44 * scale;
    const segmentLength = 27 * scale;
    const lineWidth = 9 * scale;

    context.save();
    context.lineCap = "round";
    context.lineWidth = lineWidth;

    for (let ring = 0; ring < RING_COUNT; ring += 1) {
      const radiusX = cssWidth * (0.155 + ring * 0.049);
      const radiusY = radiusX * (0.5 + ring * 0.012);
      const ringCenterX = centerX + Math.sin(ring * 0.9) * 7 * scale;
      const ringCenterY = centerY + (ring - (RING_COUNT - 1) / 2) * 1.5 * scale;
      const phase = ring % 2 === 0 ? 0 : 0.035;
      context.strokeStyle = colors[Math.min(4, Math.floor(ring / 2))] || "#72cbb2";

      for (let angle = phase; angle <= TAU + phase;) {
        const normalizedPosition = (ring + ((angle - phase) / TAU) * 0.45) / RING_COUNT;
        const reveal = clamp((revealProgress - normalizedPosition) * 18, 0, 1);
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);

        if (reveal > 0) {
          const x = ringCenterX + radiusX * cos;
          const y = ringCenterY + radiusY * sin;
          const restingAngle = Math.atan2(radiusY * cos, -radiusX * sin);
          const pointerAngle = Math.atan2(pointerY.current - y, pointerX.current - x);
          const lineAngle = mixLineAngle(restingAngle, pointerAngle, interaction.current);
          const halfLength = segmentLength * (0.55 + reveal * 0.45) / 2;
          const offsetX = Math.cos(lineAngle) * halfLength;
          const offsetY = Math.sin(lineAngle) * halfLength;

          context.globalAlpha = (0.94 - ring * 0.025) * reveal;
          context.beginPath();
          context.moveTo(x - offsetX, y - offsetY);
          context.lineTo(x + offsetX, y + offsetY);
          context.stroke();
        }

        const localSpeed = Math.hypot(radiusX * sin, radiusY * cos);
        angle += segmentSpacing / Math.max(localSpeed, 1);
      }
    }

    context.restore();
  };

  const canAnimate = () => isIntersecting && !document.hidden && !destroyed;

  const requestRender = () => {
    if (!animationFrame && canAnimate()) {
      previousFrame = performance.now();
      animationFrame = window.requestAnimationFrame(renderFrame);
    }
  };

  const renderFrame = (time: number) => {
    animationFrame = 0;
    const delta = Math.min(Math.max((time - previousFrame) / 1000, 1 / 240), 1 / 40);
    previousFrame = time;

    if (!reducedMotion.matches) {
      revealProgress = clamp((time - mountedAt - 90) / 1050, 0, 1);
      updateSpring(pointerX, 300, 22, delta);
      updateSpring(pointerY, 300, 22, delta);
      updateSpring(interaction, 190, 24, delta);
    } else {
      revealProgress = 1;
      interaction.current = 0;
      interaction.target = 0;
      interaction.velocity = 0;
    }

    draw();

    const isMoving = revealProgress < 1
      || !isSettled(pointerX)
      || !isSettled(pointerY)
      || !isSettled(interaction);
    if (isMoving) requestRender();
  };

  const resizeCanvas = () => {
    const bounds = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, Math.round(bounds.width));
    cssHeight = Math.max(1, Math.round(bounds.height));
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    readColors();
    draw();
    requestRender();
  };

  const updatePointer = (event: PointerEvent) => {
    if (!finePointer.matches || reducedMotion.matches || event.pointerType === "touch") return;

    const bounds = canvas.getBoundingClientRect();
    const buffer = Math.min(80, bounds.height * 0.18);
    const inside = event.clientX >= bounds.left - buffer
      && event.clientX <= bounds.right + buffer
      && event.clientY >= bounds.top - buffer
      && event.clientY <= bounds.bottom + buffer;

    interaction.target = inside ? 1 : 0;

    if (inside) {
      pointerX.target = event.clientX - bounds.left;
      pointerY.target = event.clientY - bounds.top;

      if (!pointerInitialized || interaction.current < 0.01) {
        pointerX.current = pointerX.target;
        pointerY.current = pointerY.target;
        pointerX.velocity = 0;
        pointerY.velocity = 0;
        pointerInitialized = true;
      }
    }

    requestRender();
  };

  const resetInteraction = () => {
    interaction.target = 0;
    requestRender();
  };

  const onMotionPreferenceChange = () => {
    revealProgress = 1;
    resetInteraction();
    draw();
    requestRender();
  };

  const onPointerPreferenceChange = () => {
    if (!finePointer.matches) resetInteraction();
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else {
      requestRender();
    }
  };

  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas);

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    isIntersecting = entry?.isIntersecting ?? true;
    if (isIntersecting) requestRender();
  }, { threshold: 0.05 });
  intersectionObserver.observe(canvas);

  const themeObserver = new MutationObserver(() => {
    readColors();
    draw();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  window.addEventListener("pointermove", updatePointer, { passive: true });
  window.addEventListener("blur", resetInteraction);
  document.addEventListener("mouseleave", resetInteraction);
  document.addEventListener("visibilitychange", onVisibilityChange);
  finePointer.addEventListener("change", onPointerPreferenceChange);
  reducedMotion.addEventListener("change", onMotionPreferenceChange);

  readColors();
  resizeCanvas();

  return () => {
    destroyed = true;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    themeObserver.disconnect();
    window.removeEventListener("pointermove", updatePointer);
    window.removeEventListener("blur", resetInteraction);
    document.removeEventListener("mouseleave", resetInteraction);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    finePointer.removeEventListener("change", onPointerPreferenceChange);
    reducedMotion.removeEventListener("change", onMotionPreferenceChange);
    delete canvas.dataset.signalMounted;
  };
}

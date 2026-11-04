/** Усі шари канви просять перемалювання через цей перехідник: головний модуль малювання реєструє себе при завантаженні, тому модулі не залежать один від одного по колу. */
let needsDraw = false;
let drawFn: () => void = () => undefined;

export function setDrawFn(fn: () => void): void {
  drawFn = fn;
}

/** Плановий кадр: кілька запитів до наступного кадру зливаються в один. */
export function requestDraw(): void {
  if (!needsDraw) {
    needsDraw = true;
    requestAnimationFrame(() => drawFn());
  }
}

/** Кадр почався: наступний запит знову планує малювання. */
export function clearRedrawFlag(): void {
  needsDraw = false;
}

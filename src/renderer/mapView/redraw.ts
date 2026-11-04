/** Усі шари канви просять перемалювання через цей перехідник: головний модуль малювання реєструє себе при завантаженні, тому модулі не залежать один від одного по колу. */
let needsDraw = false;
/** Поки стан не завантажено й заставка грає, перший кадр не малюємо: важке малювання рвало б анімацію. */
let held = true;
let drawFn: () => void = () => undefined;

export function setDrawFn(fn: () => void): void {
  drawFn = fn;
}

/** Плановий кадр: кілька запитів до наступного кадру зливаються в один. */
export function requestDraw(): void {
  if (!needsDraw) {
    needsDraw = true;
    if (!held) requestAnimationFrame(() => drawFn());
  }
}

/** Малювання дозволено: якщо його просили, поки воно було відкладене, кадр плануємо зараз. */
export function releaseDraw(): void {
  if (!held) return;
  held = false;
  if (needsDraw) requestAnimationFrame(() => drawFn());
}

/** Кадр почався: наступний запит знову планує малювання. */
export function clearRedrawFlag(): void {
  needsDraw = false;
}

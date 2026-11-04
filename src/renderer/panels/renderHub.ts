/** Усі панелі викликають загальне перемальовування через цей перехідник: головний модуль реєструє його при завантаженні, тому модулі не залежать один від одного по колу. */
let impl: () => void = () => undefined;

export function setRenderAll(fn: () => void): void {
  impl = fn;
}

export function renderAll(): void {
  impl();
}

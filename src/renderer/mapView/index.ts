// Публічний інтерфейс карти; саме малювання й жести розкладені по сусідніх модулях. Імпорти нижче також підключають модулі, що реєструють обробники подій при завантаженні.
export { view, syncImageSize, worldFromScr, scrFromWorld } from "./state";
export { isLightMode, setLightMode, notifyCoverChanged, centerWorld, fit, zoomAt, flyToWorld, centerOnWorld } from "./viewport";
export { requestDraw, releaseDraw } from "./redraw";
export { setDrawCallbacks, type RingSpec, type DrawCallbacks } from "./callbacks";
export { setRingsVisible, launchShot, activeShots } from "./shots";
export { aimBuilding } from "./annotations";
export { setShowPlaces, setPlacesStyle } from "./places";
export { centerPx, setTapHandlers, hitTestMarker, resetView, type TapHandlers } from "./gestures";
import "./draw";

import { PROTOCOL_VERSION } from "@core/squad/protocol";
import { st } from "./state";

// ---------- з'єднання ----------

export function send(obj: Record<string, unknown>): boolean {
  if (!st.ws || st.ws.readyState !== WebSocket.OPEN) return false;
  st.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...obj }));
  return true;
}

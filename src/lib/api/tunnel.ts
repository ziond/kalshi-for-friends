// Free ngrok tunnels answer browser-like requests with an HTML warning page (ERR_NGROK_6024,
// status 200) instead of forwarding them, unless this header is present. The Next.js rewrite
// passes the browser's User-Agent through, so every API call needs it. Other backends ignore it.
// Kept in its own module so the route guard (src/proxy.ts) can use it without the API client.
export const TUNNEL_HEADERS = { "ngrok-skip-browser-warning": "1" };

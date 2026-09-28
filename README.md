# The Boxer

Two boxers fight live over the internet. One player opens a private ring and sends the link to a friend, or both hit "Find an opponent" and get paired with whoever is waiting. Best of three rounds, 60 seconds each.

## Run it

```sh
npm install
npm start          # http://localhost:3000  (set PORT to change)
npm test
```

To play with someone on another machine, deploy it anywhere that runs Node and allows WebSockets (Render, Fly.io, Railway, a VPS), or expose your local port with a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

## Controls

| Action | Keys | What it does |
| --- | --- | --- |
| Move | `A` `D` / arrows | Step in and out of range |
| Guard | hold `S`, `↓` or `Shift` | Stops jabs, softens hooks, drains stamina when hit |
| Jab | `J` | Fast, longest reach, light damage |
| Hook | `K` | Slower, heavy, chips through a guard |
| Uppercut | `L` | Short range, biggest damage, cracks guards |
| Slip | `Space` | Brief dodge window that makes punches miss |
| Sound | `M` | Mute or unmute |

Phones and tablets get on-screen buttons.

Every punch and slip costs stamina. A guard hit while you're out of stamina breaks and leaves you open. Landing a punch while the other fighter is winding up or recovering is a counter and does 40% more damage.

## How it works

- `public/game.js`: the fight simulation (frame data, stamina, blocking, counters, rounds). Pure and deterministic, shared by server and browser.
- `server.js`: serves the page and runs one authoritative 60 Hz simulation per room over WebSockets, broadcasting snapshots at 30 Hz. Clients only send held keys and button presses, so nobody can cheat by editing their client.
- `public/client.js`: lobby, input, and a canvas renderer that animates the fighters from the server state.

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

| Key | Action |
| --- | --- |
| `A` | Punch: fast and cheap |
| `B` | Kick: slower, longer reach, hits harder |
| `C` (hold) | Block |
| `D` | Aim at the head |
| `E` | Aim at the tummy |
| `←` `→` | Move |
| `M` | Mute or unmute |

Phones and tablets get on-screen buttons.

Your aim stays where you last set it, so you can tap `E` then `A`, or hold `E` while pressing `A`, for a tummy punch. A block only covers the height you're aiming at: guard the head and a tummy kick goes straight in. Head shots do more damage; tummy shots knock the wind out and drain stamina. Every attack costs stamina, a guard with no stamina left breaks, and hitting someone mid-attack is a counter worth 40% more.

## How it works

- `public/game.js`: the fight simulation (punch/kick frame data, head/tummy aim, stamina, blocking, counters, rounds). Pure and deterministic, shared by server and browser.
- `server.js`: serves the page and runs one authoritative 60 Hz simulation per room over WebSockets, broadcasting snapshots at 30 Hz. Clients only send held keys and button presses, so nobody can cheat by editing their client.
- `public/client.js`: lobby, input, and a canvas renderer that animates the fighters from the server state.

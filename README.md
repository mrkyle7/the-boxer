# The Boxer

Two to four boxers fight live over the internet. One player opens a private ring and sends the link to up to three friends, then starts the fight when everyone is in; or two players hit "Find an opponent" and get paired with whoever is waiting. Best of three rounds, 60 seconds each.

Two fighters box side on. Three or four fight a free-for-all in the ring, seen from above: everyone always faces the nearest opponent, an attack lands on whoever is in front of it and in reach, and a guard only covers the front, so you can be caught from the side. The last one standing takes the round; at the bell, the healthiest fighter still standing does. Anyone who leaves mid-fight is out, and the rest fight on.

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
| `↑` `↓` | Move up and down the ring (three or four players) |
| `M` | Mute or unmute |

Phones and tablets get on-screen buttons.

A fighter called **Luna** gets a helping hand: she walks 20% faster, her punches and kicks reach 20% further, she steps in when an attack is just out of reach, and in the ring her walking bends towards the opponent she's heading for.

Your aim stays where you last set it, so you can tap `E` then `A`, or hold `E` while pressing `A`, for a tummy punch. A block only covers the height you're aiming at: guard the head and a tummy kick goes straight in. Head shots do more damage; tummy shots knock the wind out and drain stamina. Every attack costs stamina, a guard with no stamina left breaks, and hitting someone mid-attack is a counter worth 40% more.

## Deployment

Live at **https://boxer.cheetahmoongames.com**, one of the games linked from [cheetahmoongames.com](https://cheetahmoongames.com).

It runs as the `the-boxer` Cloud Run service, alongside the other games on the site. Its infrastructure is defined in [mrkyle7/cheetahmoongames](https://github.com/mrkyle7/cheetahmoongames): the `boxer` entry in `terraform/games.tf` covers the service, its settings, subdomain and DNS. That entry also lets this repo deploy through Workload Identity Federation, so there are no keys to manage here. Change the service's settings there, not here.

`.github/workflows/ci-cd.yml` runs the tests and a container smoke test on every push and pull request. On `main` it builds the `Dockerfile`, pushes the image to the game's own Artifact Registry repository (`the-boxer`) and deploys it as `the-boxer-deploy`, an account that can deploy only this service, independently of Bartenders. If a deploy fails it rolls traffic back to the last healthy revision.

The service is capped at **one instance**: rooms live in memory, so both fighters have to reach the same server. One instance holds hundreds of WebSocket connections. Scaling past that would need shared room state (for example Redis) first.

## How it works

- `public/game.js`: the fight simulation (punch/kick frame data, head/tummy aim, stamina, blocking, counters, rounds). Pure and deterministic, shared by server and browser.
- `public/game.js` has two modes: `side` for two fighters (one dimension, as it always was) and `ring` for three or four (two dimensions, facing the nearest opponent, hits in a forward arc, guards only from the front, last one standing). The moves, frame data, aiming and blocking are shared.
- `server.js`: serves the page and runs one authoritative 60 Hz simulation per room over WebSockets, broadcasting snapshots at 30 Hz. Clients only send held keys and button presses, so nobody can cheat by editing their client. Quick matches pair two strangers; private rooms hold up to four and the first one in (the host) starts the fight.
- `public/client.js`: lobby, the room screen, input, and two canvas renderers that animate the fighters from the server state: side on for two, from above for three or four.
- `auth.js`: who's signed in to Cheetah Moon (the same file as `scripts/game-template/auth.js` in mrkyle7/cheetahmoongames). The WebSocket upgrade carries the shared login cookie, so signed-in players fight under their account name and can't be renamed; guests still type a name in the lobby. `/api/me` tells the lobby which to show. Locally, start with `ACCOUNTS_URL=http://localhost:8080` and sign in on the home page running there.
- `public/icon.svg` (the red glove) is the favicon; `public/icons/` has the PNG app icons rendered from it with `scripts/render-icons.js` in mrkyle7/cheetahmoongames. `public/manifest.webmanifest` and `public/sw.js` make The Boxer installable on phones and desktops. The service worker only shows `public/offline.html` when there's no connection; it never caches the game, so deploys are live straight away.

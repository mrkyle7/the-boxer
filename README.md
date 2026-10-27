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

A fighter called **Luna** gets a helping hand: she walks 20% faster, her punches and kicks reach 20% further, she steps in when an attack is just out of reach, and in the ring her walking bends towards the opponent she's heading for. And once she's two letters into a cheat code, nothing can touch her (no hits, no giant fist, no poison) until she finishes the word, gets a letter wrong or stops typing for five seconds; she can't attack while she's spelling, though. A violet bubble shows it.

Your aim stays where you last set it, so you can tap `E` then `A`, or hold `E` while pressing `A`, for a tummy punch. A block only covers the height you're aiming at: guard the head and a tummy kick goes straight in. Head shots do more damage; tummy shots knock the wind out and drain stamina. Every attack costs stamina, a guard with no stamina left breaks, and hitting someone mid-attack is a counter worth 40% more.

Look out for the **giant fist**: every five to fifteen seconds a shadow appears under a random fighter, and a second later a giant fist slams down there. Anyone still under it takes 30 damage, guard or no guard, so get out of the way. It seems to have it in for anyone called Kyle: he's three times as likely to be picked.

On a phone, tap the **⌨** button to bring up a letter pad for the cheat codes.

Psst: type **zeffen** during a fight for the Zeffen flip, a front flip at your opponent (it reaches about as far as the Luna vault) that hits twice, 25 a time. It can't be blocked, but it's aimed where they were when you jumped, so they can still step out of the way. Nothing can touch you while you're in the air (not even the giant fist). Everyone can see the letters going in over your head, and getting hit wipes them, so hit them before they finish typing.

Or type **kalya** for the vault: a flip right over your opponent, landing behind them, and a kick in the back for 30. Their guard only covers the front, so it can't be blocked. **luna** teleports you right next to the nearest opponent and kicks them. **louise** busts out a dance (a shimmy, a twirl), reeling the nearest opponent in on a pink ribbon, and hip-bumps them for 30 (start too far away and they might not be reeled in close enough in time); **tamzin** cartwheels across at them for 30; and **grandpa** makes you super fast for ten seconds.

Two more go on you: **jemini** makes you a glowing giant (with a ghostly twin) for 10 seconds, and your hits do 10% more; **kyle** makes you vanish in a puff of smoke, invisible to everyone else for 10 seconds (you still see a faint shimmer of yourself). While invisible you walk straight through people and nobody turns to face you, so you can get behind them. But if it wears off while you are standing inside someone, you are thrown out of them and take 10 damage.

And three more:
- **shree**: you take control of the giant fist. Move its shadow with left and right (and up and down in the ring), then punch to drop it on someone for 30. You stand still while you steer it, and getting hit makes you let go. If you don't punch, it drops by itself after ten seconds.
- **shaan**: a shrink ray at the one you're fighting. They go small for ten seconds and their hits do 10% less. Zap a Jemini giant and they just go back to normal size.
- **parimal**: beep beep! You jump in a car, which revs for a moment and then drives straight at the nearest fighter, for 30. In the ring, step aside. One on one, jump over it with **space** (or the Jump button on a phone). Jumping is too early if you do it the moment you hear the horn, and just right when it sets off. A jump only gets you over the car: you can still be punched in the air.

Or **spreadbury**: USA! USA! For ten seconds everything goes stars and stripes (Uncle Sam hats for everyone, fireworks), and two hotdogs come floating down at random moments, with a shadow where each will land. Get under one and grab it on the way down (once it's about head height; jump to reach it sooner, one on one) for half your health back. If nobody catches it, it splats on the floor. **mamtora** does the same with India: the tricolour, marigold garlands and petals, and dosas instead of hotdogs.

Or **edward**: a secret pause. For ten seconds nothing does any damage and the clock stands still, but nobody else is told (unless they spot the letters going in): the fight carries on looking just the same, and stamina still goes up and down as normal.

Or **mummy**: love all round for ten seconds (a pink ring of hearts on the floor). Anyone who comes too close is caught in a loving cuddle, held for a second, and Mummy steals 10 health from them. Only one cuddle each, though, so nobody can be trapped in a corner, and once everyone has had theirs the love is spent.

Or **daddy**: a pair of fast shoes (red trainers with lightning bolts and little wings) for ten seconds, and you run at 1.8x speed.

Or **tony**: you turn into a chess piece for ten seconds, picked at random, each with its own trick. A **pawn** hits for 75%, but three hits and it promotes to a queen. A **knight** leaps over guards (no blocking it) and reaches 50% further. A **bishop** heals 5 with every hit. A **rook** hits for 125%, takes half damage and can't be knocked back, but moves slowly. A **queen** hits for 150%, reaches 25% further and moves 50% faster. A **king** can't be taken (no damage at all, not even from the giant fist), but hits for half and moves at half speed.

Or **ludo**: a sword for ten seconds. Punches become sword slashes with 50% more damage and 25% more reach; no kicks while you hold it.

Or **jay**: a vampire for ten seconds. Your hits do half damage, but drain it, healing you by as much as they take. Or **leo**: a lion for ten seconds. Punches become claw swipes for 1.5x damage, but no kicks and no blocking.

Or **daniel**: you go spiky for ten seconds. Anyone who hits you gets 70% of it back, and you only take the other 30%. (Except the giant fist: there's nobody to spike.)

Or **priya**: a freeze ray at the one you're fighting. If it reaches them they're stuck in a block of ice for three seconds (they can still be hit). Hold block, facing it, to stop it, or get out of its way: it flies straight.

**fart** turns you round and lets one go: a green cloud drifts at whoever you're fighting, and if it reaches them they're poisoned for the rest of the match, 5 damage every 10 seconds. Jump over it to dodge it (or get out of its way in the ring).

**water** floods the ring and stops the clock. Everyone has ten seconds to type **boat** or **swim** (a big prompt on screen tells you, and on a phone the letter pad pops up). The first to type **boat** gets the boat; anyone else has to keep typing **swim** (each one adds four seconds, up to ten) or they sink and are knocked out. The flood lasts ten seconds from the first boat or swim.

And **harrison**? Type it and find out. It's different every time.

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
- `auth.js`: who's signed in to Cheetah Moon (the same file as `scripts/game-template/auth.js` in mrkyle7/cheetahmoongames). The WebSocket upgrade carries the shared login cookie, so signed-in players fight under their account name and can't be renamed; guests still type a name in the lobby, and a guest who starts playing is reported with `auth.guestSeen(name)` for the owner's login alerts. `/api/me` tells the lobby which to show. Locally, start with `ACCOUNTS_URL=http://localhost:8080` and sign in on the home page running there.
- `public/icon.svg` (the red glove) is the favicon; `public/icons/` has the PNG app icons rendered from it with `scripts/render-icons.js` in mrkyle7/cheetahmoongames. `public/manifest.webmanifest` and `public/sw.js` make The Boxer installable on phones and desktops. The service worker only shows `public/offline.html` when there's no connection; it never caches the game, so deploys are live straight away.

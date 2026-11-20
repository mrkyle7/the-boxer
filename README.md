# The Boxer

Two to four boxers fight live over the internet. One player opens a private ring and sends the link to up to three friends, then starts the fight when everyone is in; or two players hit "Find an opponent" and get paired with whoever is waiting. Best of three rounds, 60 seconds each.

No one to fight? Pick **Easy**, **Medium** or **Hard** under "Fight the computer" for a bout against a bot, or add bots to a private ring to fill the corners (the host can take them out again). Easy bots are slow to react and rarely block; Hard ones read your attacks, guard at the right height, punish mistakes and throw cheat codes at you every few seconds. Bots always agree to a rematch.

Two fighters box side on. Three or four fight a free-for-all in the ring, seen from above: everyone always faces the nearest opponent, an attack lands on whoever is in front of it and in reach, and a guard only covers the front, so you can be caught from the side. The last one standing takes the round; at the bell, the healthiest fighter still standing does. Anyone who leaves mid-fight is out, and the rest fight on.

## Adventure mode

Fancy a change from boxing? **Adventure** is a side-scrolling platformer where you are the boxer. Pick **Play solo**, or **Team up** to open a room for up to four and send friends the link (anyone can start it on their own, too). You all play together, co-op, on the same screen: the camera follows whoever is out in front but never leaves anyone behind.

Four levels, each with its own creatures and a boss in a ring at the end. Beat the boss and it's on to the next level, everyone back in with full health. You start on level 1, or pick any level in the lobby.

1. **Sunny Meadow.** Slimes hop at you, bees stop with a "!" and dive, hedgehogs curl into spiky balls and roll at you, frogs spit bubbles. The boss is **Big Horn**, the boxing rhino. He paws the ground and charges, crashes into the ropes and is left dizzy (that's when your hits do 50% more), and stomps to send shockwaves along the floor (a guard won't stop those: jump them). At half health he gets angry: faster, and he throws boulders (punch them out of the air).
2. **Spooky Forest**, at night. Purple goo, bats, snails that hide in their shells and slide at you, and toadstools that puff spores. The boss is **Count Hoot**, an owl in boxing gloves. He flies out of reach, rains feathers down on you, and swoops. If he misses, he's stuck in the ground, dazed, so hit him then.
3. **Frosty Peaks.** The ground is slippery here. Ice cubes, snowbirds, penguins that belly-slide at you, and snowmen throwing snowballs. The boss is **Frostbite** the yeti, who charges, bowls giant snowballs along the ground (jump them) and stomps. Angry, he brings icicles down from above.
4. **Volcano.** Mind the lava. Lava blobs, fire imps, crabs that raise their claws (spiky, and no punch gets through), and lizards spitting fireballs. The boss is **the Silverback**, the undefeated champ. He leaps across the ring and lands with a shockwave, throws lava rocks, charges, and beats his chest to bring rocks down on you.

Anything that falls from above hangs at the top of the screen, shaking, for a moment first, so you can get out from under it.

Jump on most creatures' heads to squash them (hold jump to bounce higher). Anything spiky hurts to land on, and nothing gets through a shell. Grab coins for points and hearts for health. Every sixth creature down drops a heart, and each level has a 1UP hidden up high. The team shares a pool of lives, three each: fall down a hole or run out of health and you lose one, and drop back in a moment later. Lose the last and you're out; when everyone's out it's game over.

| Key | Action |
| --- | --- |
| `←` `→` | Move |
| `Space` or `↑` | Jump (hold for higher) |
| `A` | Punch |
| `B` | Kick: slower, reaches further, hits harder |
| `C` (hold) | Block |
| `↓` + jump | Drop down through a platform |

Phones get on-screen buttons, and the ⌨ button brings up a letter pad for the cheat codes.

### Cheat codes in the adventure

Every cheat code from the ring works in the adventure too, turned on the creatures. Type it while you play. As in the ring, everyone sees the letters going in over your head, and getting hit wipes them. A letter that carries on a code doesn't also punch or jump.

- **zeffen** flips you forward over everything, landing twice for 25. **kalya** vaults over the nearest creature and kicks it in the back for 30. **luna** teleports you next to the nearest creature and kicks it. **louise** reels the nearest creature in on a ribbon and hip-bumps it for 30. **tamzin** cartwheels at it for 30.
- **grandpa**, 50:50: super fast for ten seconds, or a charge at the nearest creature that ends in a kick. **lizzie** charges at it and shoulder-smashes it for 20.
- **fart**: a green cloud drifts at the creatures, poisoning everything it touches (3 damage every 2 seconds).
- **water** floods the level for ten seconds. Creatures caught in it float about helpless, taking on water, and the holes fill up so you can swim across them. Swimming is slow, so type **boat** or **swim** to get moving.
- **jemini** makes you a giant (your hits do 25% more and reach further). **kyle** makes you invisible: creatures can't see you and walk right through you. **daddy** gives you fast shoes. **jay** makes you a vampire (half damage, but it heals you). **leo** makes you a lion and **ludo** gives you a sword: punches for 1.5x, but no kicks. **daniel** makes you spiky: anything that bumps into you gets 70% of it back. **blake** makes you a dragon: punch breathes fire that reaches further, gets through shells and sets creatures alight. **tony** turns you into a chess piece, each with its own trick (the king can't be hurt at all). Each of these lasts ten seconds.
- **shree** brings the giant fist down on the three nearest creatures, 30 each. **shaan** shrinks one (it hits for half and takes 50% more), **priya** freezes one in a block of ice, and **bear** sticks one in honey (half speed). **parimal** puts you in a car that drives through everything for 30 and hops the holes.
- **edward** stops time for six seconds: every creature and everything it's thrown freezes, but you don't.
- **spreadbury** and **mamtora** bring on the USA and India: two hotdogs (or dosas) float down; catch one for 50 health.
- **mummy**: anything that comes close gets a cuddle, and she steals 10 of its health. **simon**: a moustache for the rest of the level (an 11% chance a punch is a knockout, and a 14% chance you nod off). **briony**: you juggle, then throw three pies; a pie in the face leaves a creature blundering about, harmless, for five seconds. **paul**: a lullaby on the piano, and every creature on screen falls asleep until it's hit.
- **supercalifragilisticexpialidocious**: invincible for the rest of this level and all of the next, once a game. **harrison**: a different one every time.

Bosses can be frozen, shrunk, put to sleep, pie-faced or stuck in honey too, though they shake off the ice, the sleep and the pie sooner.

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

Stuck in a corner, one on one? **Jump** to leapfrog right over your opponent's head and land behind them (nothing can touch you on the way over).

Anywhere, any time: **block three hits in quick succession** (within a second and a half) and you shove whoever's hitting you off you, no damage. You can only break free once every two seconds.

Look out for the **giant fist**: every five to fifteen seconds a shadow appears under a random fighter, and a second later a giant fist slams down there. Anyone still under it takes 30 damage, guard or no guard, so get out of the way. It seems to have it in for anyone called Kyle: he's three times as likely to be picked.

On a phone, tap the **⌨** button to bring up a letter pad for the cheat codes.

Psst: type **zeffen** during a fight for the Zeffen flip, a front flip at your opponent (it reaches about as far as the Luna vault) that hits twice, 25 a time. It can't be blocked, but it's aimed where they were when you jumped, so they can still step out of the way. Nothing can touch you while you're in the air (not even the giant fist). Everyone can see the letters going in over your head, and getting hit wipes them, so hit them before they finish typing.

Or type **kalya** for the vault: a flip right over your opponent, landing behind them, and a kick in the back for 30. Their guard only covers the front, so it can't be blocked. **luna** teleports you right next to the nearest opponent and kicks them. **louise** busts out a dance (a shimmy, a twirl), reeling the nearest opponent in on a pink ribbon, and hip-bumps them for 30 (start too far away and they might not be reeled in close enough in time); **tamzin** cartwheels across at them for 30; and **grandpa** is one of two, 50:50: either you go super fast for ten seconds, or you charge, sprinting flat out at whoever's nearest and kicking them when you get there (a hit on the way stops you).

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

Or **blake**: you turn into a dragon for ten seconds (green scales, horns, wings and a tail). Punch breathes fire instead: it reaches further than a punch, no guard stops it, and it sets them on fire, 1 damage a second for five seconds. Then you need two seconds to get your breath back. Kick is a tail whip, exactly the same as a kick.

Or **lizzie**: you turn into a rugby player (hooped shirt, scrum cap) and charge flat out at whoever's nearest, shoulder-smashing them for 20 when you get there. No guard stops it: get out of the way, or jump it one on one. A hit on the way stops the charge.

Or **simon**: a giant handlebar moustache for the rest of the match. Every punch you land has a 11% chance of being an instant knockout, but also a 14% chance you get sleepy and nod off for five seconds. While you nap you can't move, punch, block or type, so you're wide open.

Or **bear**: you throw a dollop of honey at whoever's nearest. It only carries about a quarter of the screen, so get close first. Whoever it splats is stuck in it, moving at half speed for ten seconds. Jump over it to dodge it.

Or **priya**: a freeze ray at the one you're fighting. If it reaches them they're stuck in a block of ice for three seconds (they can still be hit). Hold block, facing it, to stop it, or get out of its way: it flies straight.

Or **briony**: you turn into a clown (rainbow wig, red nose, frilly ruff) and juggle three balls. After a second a pie lands on each ball, and you throw them one after another at the head of whoever's nearest: 10 a pie, and they're left with a face full of blueberry or raspberry for five seconds. Guard your head, facing the pies, and they splat on your gloves instead. The clown stands still while juggling, and a hit makes them drop the lot.

Or **paul**: you sit down at a piano and play a lullaby. Two seconds later everyone else falls fast asleep (nightcaps on) and stays asleep, wide open, until something hits them. They can't move, block or type in their sleep. Hit the pianist before the song's over and the music stops, and nobody nods off.

Or, if you can spell it, **supercalifragilisticexpialidocious**: invincible for two rounds, the rest of this one and all of the next. Nothing touches you (no hits, no giant fist, no poison, no fire, no sinking) and a golden bubble shows it. Once a match. It's a long word to type with everyone watching, though, and a hit wipes the letters.

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
- `public/adventure.js`: adventure mode's simulation, shared by server and browser the same way: the four levels (ground, platforms, holes, pickups and where creatures appear), platform physics, the creatures and bosses, the cheat codes as they work on creatures, the forward-only camera and the team's lives. It uses its own seeded random numbers (for grandpa, tony, harrison and the rest), so a game can be replayed from its seed. The server runs it in rooms of kind `adventure` (no bots, one to four players). `public/adventure-client.js` draws it on its own screen, borrowing the boxers from `client.js` (`window.BoxerArt`) so they look the same as in the ring.
- `bot.js`: the computer fighters. A bot plays through the same controls as a person (held keys, button presses and typed letters), deciding what to do every few ticks; the three levels differ in reaction time, how often they block and read the right height, how keen they are to attack, and how often they type a cheat code.
- `public/client.js`: lobby, the room screen, input, and two canvas renderers that animate the fighters from the server state: side on for two, from above for three or four.
- `auth.js`: who's signed in to Cheetah Moon (the same file as `scripts/game-template/auth.js` in mrkyle7/cheetahmoongames). The WebSocket upgrade carries the shared login cookie, so signed-in players fight under their account name and can't be renamed; guests still type a name in the lobby, and a guest who starts playing is reported with `auth.guestSeen(name)` for the owner's login alerts. `/api/me` tells the lobby which to show. Locally, start with `ACCOUNTS_URL=http://localhost:8080` and sign in on the home page running there.
- `public/icon.svg` (the red glove) is the favicon; `public/icons/` has the PNG app icons rendered from it with `scripts/render-icons.js` in mrkyle7/cheetahmoongames. `public/manifest.webmanifest` and `public/sw.js` make The Boxer installable on phones and desktops. The service worker only shows `public/offline.html` when there's no connection; it never caches the game, so deploys are live straight away.

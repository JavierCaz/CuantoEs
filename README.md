# ¿Cuánto es?

**Walk through a 3D museum to get a feel for how big the money figures in the news really are.**

Millions, billions, *billones*… past a certain point the numbers stop meaning anything. *¿Cuánto es?* turns an amount in Mexican pesos (MXN) into physical stacks of real-size $500 banknotes and lets you walk among them, next to familiar objects like people, cars, buses and buildings for scale.

The interface is in Spanish (es-MX).

## Features

- **A museum you walk through** — one continuous complex of concrete, cantera and volcanic stone on a single processional axis, inspired by minimalist Mexican monumentalism:
  - **Plaza de acceso**: high walls, dry gardens and the monumental portal.
  - **Vestíbulo**: how to read the museum, with a ruler along one wall where each step is worth ten times the last, from one $500 bill to a $500 million tarima.
  - **Four themed salas**, each opened by a patio: *Tu dinero* (escala personal), *Tu ciudad* (local), *Tu país* (nacional) and *Las diferencias* (social). Every exhibit has its own hall, from wages and housing to municipal budgets, megaprojects, health, education, public debt and the largest fortune in Mexico.
  - **Patio de reflexión**: a water mirror, benches and every source in the museum.

  Halls that fit in a 60 × 80 m nave get an 18 m roof cut by skylights; bigger amounts open to the sky as expansion patios.
- **Sourced, labelled figures** — each exhibit says whether it's an approved budget, an official figure, a projection, an estimate, a statistic or a calculation by the museum, what it covers, its source and when it was checked.
- **Comparisons** — every hall compares its amount with related ones ("6.7 veces el AIFA").
- **Your own yardstick** — type your monthly income and every hall tells you how long it would take you to earn it.
- **Custom amounts** — type any amount (e.g. `2.5 mil millones`) up to 10¹⁵ pesos and see it in the Sala temporal, at the end of the tour.
- **Scale references** — people, furniture, vehicles, sports fields and buildings placed beside the money.
- **First-person or aerial view** — walk with the keyboard/mouse or touch controls, or press <kbd>V</kbd> for an overhead view.
- **Layered soundtrack** — generative background music (Web Audio, no audio files) that shifts with the amount: warm piano and nylon guitar for everyday figures (*familiaridad*), a light electronic pulse around a million (*curiosidad*), wide sustained chords for the big public works (*asombro*), and sparse bells for the federal budget (*reflexión*). Moods crossfade as you walk between halls; see [`src/audio/moods.ts`](src/audio/moods.ts).
- **Desktop and mobile** — pointer-lock controls on desktop, virtual joystick on touch screens.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Left joystick |
| Look | Mouse | Drag on the right side |
| Run | <kbd>Shift</kbd> | — |
| Aerial view | <kbd>V</kbd> | "Vista aérea" button |
| Music on/off | <kbd>M</kbd> | "Música" button |
| Release mouse | <kbd>Esc</kbd> | — |

## Getting started

Requires [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite with Vitest (watch mode) |
| `npm run typecheck` | Type-check without building |

## Project structure

```
src/
├── main.ts          # App entry: wires scene, controls, museum and UI
├── audio/           # Generative soundtrack and its moods
├── controls/        # Player movement, desktop/touch input, collision
├── data/
│   └── presets.json # Exhibits: amounts, salas, figure types and sources
├── i18n/            # Number parsing and formatting (es-MX)
├── money/           # Banknote dimensions, stack layout, rendering
├── museum/          # The collection, the complex's plan, hall planning, reference placement
├── scene/           # Three.js world, architecture, materials, gardens, signage, aerial view
│   └── references/  # Scale objects: people, vehicles, buildings…
└── ui/              # Amount input, preset panel, HUD
tests/               # Vitest unit tests
```

## Adding an exhibit

Exhibits come from [`src/data/presets.json`](src/data/presets.json). They're grouped by `sala` and ordered by amount within each one automatically. Each entry looks like:

```json
{
  "id": "tren-maya",
  "sala": "tu-pais",
  "titulo": "Tren Maya",
  "monto": 500000000000,
  "año": 2025,
  "tipo": "estimado",
  "pregunta": "¿Cuánto costó al final el Tren Maya?",
  "descripcion": "Short explanation shown in the hall.",
  "alcance": "What the figure includes and leaves out.",
  "fuente": "Source name",
  "fuente_url": "https://…",
  "consulta": "2026-10-27",
  "compara": ["aifa", "tren-interurbano"],
  "referencias": ["persona", "porteria", "alberca"]
}
```

- `sala`: `tu-dinero`, `tu-ciudad`, `tu-pais` or `las-diferencias` (see [`src/museum/collection.ts`](src/museum/collection.ts)).
- `tipo`: `aprobado`, `oficial`, `proyectado`, `estimado`, `estadistica` or `calculo`. A budget that was approved isn't money that was spent, and an initial budget isn't an accumulated cost: say which one it is.
- `monto` is in nominal pesos of the year given (`año`), not adjusted for inflation.
- `consulta`: the date the source was last checked, or `null` if it hasn't been re-checked.
- `compara`: ids of other exhibits worth comparing against.
- `referencias`: scale objects, smallest first; `persona` goes first in every hall.

Please always cite a source for real-world figures. `npm test` checks every entry has these fields.

## Built with

- [Three.js](https://threejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Vitest](https://vitest.dev/)

## License

[MIT](LICENSE) © 2026 Javier Cazares

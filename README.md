# ¿Cuánto es?

**Walk through a 3D museum to get a feel for how big the money figures in the news really are.**

Millions, billions, *billones*… past a certain point the numbers stop meaning anything. *¿Cuánto es?* turns an amount in Mexican pesos (MXN) into physical stacks of real-size $500 banknotes and lets you walk among them, next to familiar objects like people, cars, buses and buildings for scale.

The interface is in Spanish (es-MX).

## Features

- **Museum rooms** — each room holds a real-world figure, sorted from smallest to largest, with its source:
  - Un año de salario mínimo (2026)
  - Un millón de pesos
  - Aeropuerto Felipe Ángeles (AIFA)
  - Presupuesto de la CDMX 2026
  - Refinería Olmeca (Dos Bocas)
  - Tren Maya
  - Presupuesto federal 2026 (PEF)
- **Custom amounts** — type any amount (e.g. `2.5 mil millones`) up to 10¹⁵ pesos and see it in a temporary room.
- **Scale references** — people, furniture, vehicles, sports fields and buildings placed beside the money.
- **First-person or aerial view** — walk with the keyboard/mouse or touch controls, or press <kbd>V</kbd> for an overhead view.
- **Desktop and mobile** — pointer-lock controls on desktop, virtual joystick on touch screens.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Left joystick |
| Look | Mouse | Drag on the right side |
| Run | <kbd>Shift</kbd> | — |
| Aerial view | <kbd>V</kbd> | "Vista aérea" button |
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
├── main.ts          # App entry: wires scene, controls, rooms and UI
├── controls/        # Player movement, desktop/touch input, collision
├── data/
│   └── presets.json # Museum rooms: amounts, descriptions and sources
├── i18n/            # Number parsing and formatting (es-MX)
├── money/           # Banknote dimensions, stack layout, rendering
├── museum/          # Room planning, doors and reference placement
├── scene/           # Three.js world, warehouse, signage, aerial view
│   └── references/  # Scale objects: people, vehicles, buildings…
└── ui/              # Amount input, preset panel, HUD
tests/               # Vitest unit tests
```

## Adding a room

Rooms come from [`src/data/presets.json`](src/data/presets.json) and are ordered by amount automatically. Each entry looks like:

```json
{
  "id": "tren-maya",
  "titulo": "Tren Maya",
  "monto": 500000000000,
  "año": 2025,
  "descripcion": "Short explanation shown in the room.",
  "fuente": "Source name",
  "fuente_url": "https://…",
  "referencias": ["persona", "auto", "autobus"]
}
```

Please always cite a source for real-world figures.

## Built with

- [Three.js](https://threejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Vitest](https://vitest.dev/)

## License

[MIT](LICENSE) © 2026 Javier Cazares

# Brand assets (sources)

The owner's VScout logo exports. **The app icon is the dark 1024 version** (owner, 2026-10-01).

| File                         | What                                                          |
| ---------------------------- | ------------------------------------------------------------- |
| `vscout-icon-dark-1024.png`  | App icon, dark (masked squircle, transparent corners)         |
| `vscout-icon-light-1024.png` | App icon, light variant (kept for marketing / future theming) |
| `vscout-glyph-1024.png`      | The robot-scope glyph on transparent (favicon, in-app logo)   |

Everything under `public/icons/` and `public/favicon.ico` is generated from these:

```sh
python3 scripts/generate-icons.py   # needs Pillow (pip install pillow)
```

Don't edit generated files by hand; change the source and re-run.

# TraceLabs branding assets

This directory preserves the original artwork supplied in the repository and documents the project's asset placements.

## Original source files

| Original file | Dimensions | Use |
|---|---:|---|
| `icon 1024.png` | 1024 x 1024 | Primary full-colour launcher artwork |
| `logo 512.png` | 512 x 512 | Square brand mark |
| `wordmark small.png` | 1200 x 300 | Horizontal wordmark |
| `favicon.png` | 48 x 48 | Browser favicon |
| `logo big.png` | Not re-encoded | Original large logo master |
| `wordmark  big.png` | Not re-encoded | Original large wordmark master |

The source images are PNG files. They are not renamed to SVG, and no monochrome artwork was supplied.

## Placed copies

- `android/app/src/main/res/mipmap-nodpi/ic_launcher.png`: full-colour launcher source.
- `android/app/src/main/res/drawable-nodpi/tracelab_brand_mark.png`: square mark for Android UI.
- `android/app/src/main/res/drawable-nodpi/tracelab_wordmark.png`: horizontal wordmark for Android UI.
- `backend/public/assets/brand/tracelab-mark.png`: square web mark.
- `backend/public/assets/brand/tracelab-wordmark.png`: horizontal web wordmark.
- `backend/public/favicon.png`: browser favicon.

The files at the repository root are intentionally retained as originals until application code has been updated and verified against the new paths.

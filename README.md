# Dizilerim 📺

A personal TV show tracker for iPhone, built as a Progressive Web App (PWA).
The main goal of this project is learning how an app goes from idea to release.

> The app's interface is in Turkish.

## Install on iPhone

1. Open the site in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. From now on, open the app from the home screen icon.

> Note: The home screen app and the Safari tab keep **separate** data.
> Add your shows from inside the home screen app.

## Features

- Search shows (powered by TVmaze)
- Mark single episodes, whole seasons or an entire show as watched — and undo
- "Watched up to here": optionally mark all earlier episodes too
- Up next list and progress bars
- Daily check for new episodes (when the app is opened)
- Spoiler protection for unwatched episode descriptions
- Statuses: Watching / Plan to watch / Completed / Dropped
- Upcoming episode calendar
- Stats, personal rating and notes
- Personal recommendations based on your favourite shows (TMDB)
- Quick link to each show's IMDb page
- Backup / restore as a JSON file
- Works offline

## Project structure

```
index.html            Page skeleton and bottom tab bar
styles.css            Styling (dark/light theme)
manifest.webmanifest  "Add to Home Screen" metadata (name, icon, colors)
sw.js                 Service worker: offline support
js/app.js             Screens and user interactions
js/logic.js           Pure functions (next episode, progress, stats…)
js/store.js           On-device storage (localStorage)
js/api.js             TVmaze API requests
js/tmdb.js            TMDB API requests (recommendations)
js/ui.js              Toasts, bottom sheets, icons
tests/                Unit tests
```

## Development

No build step — plain HTML, CSS and JavaScript.

```bash
# run locally
python3 -m http.server 8000   # → http://localhost:8000

# run tests
node --test
```

## Data & privacy

Show data is provided by [TVmaze](https://www.tvmaze.com/api) (CC BY-SA).
Recommendations use the [TMDB](https://www.themoviedb.org) API but this app is not endorsed or certified by TMDB.
To enable recommendations, get a free TMDB API key and paste it under **Profil → Ayarlar** in the app.
The key is stored only on your device and is never committed to this repository.
Your personal data (watched episodes, notes, ratings) is stored only on your device and is never sent to any server.

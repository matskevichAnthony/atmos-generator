# Architecture

Ориентир для тех, кто продолжает разработку (человек или модель). Описывает, как
устроен проект и, подробно, флагманский прибор `/corruptor/`.

## Общая картина

```
server.mjs            zero-dep статик-сервер (:5173), корень = import.meta.dirname
index.html            главная: <strudel-editor> + навигация + REC
shared/capture.js     универсальный отвод аудио → WAV (подключён на всех страницах)
kick/ rumble/ atmos/  самостоятельные приборы (index.html + <name>.css + <name>.js)
studio/               многослойная студия (layers.js = определения слоёв)
corruptor/            DC-77 — самый сложный прибор, разложен на 8 модулей
```

Общие принципы:
- Движок — `@strudel/web` (в браузере это superdough + core), импортируется как
  самодостаточный бандл по абсолютному пути `/node_modules/@strudel/web/dist/index.mjs`.
  `@strudel/repl` (`<strudel-editor>`) используется только на главной.
- Ключевые экспорты движка: `initStrudel`, `evaluate(code)` (компилирует и играет,
  повторный вызов = горячая замена), `hush()`, `samples(url|map)`,
  `getAudioContext()`, `getAudioContextCurrentTime()`, `getAnalyzerData(type, id)`.
- Паттерн приборов-генераторов: `state` → `build*()` собирает строку Strudel-кода →
  `evaluate()` играет; ползунок меняет state → пересборка → горячая замена.

## shared/capture.js

Классический (не-module) скрипт, подключается **первым** в `<head>` каждой
страницы, до модулей движка. Патчит `window.AudioContext`/`webkitAudioContext`:
любой созданный контекст получает `ScriptProcessor`-отвод, который читает мастер
(через monkeypatch `AudioNode.prototype.connect`: всё, что идёт в `destination`,
дублируется в отвод). API: `startRaw`/`stopRaw` (сырой захват), `slice(raw, t, sec)`
(сэмпл-точная вырезка по времени), `makeWav`/`saveBlob` (16-bit WAV + анти-клип),
`getLevel`/`getScope` (метры), `getCapturedEnd` (для ожидания захвата),
`attach(button, opts)` (готовая REC-кнопка). Почему WAV: DAW не открывают
webm/opus, который отдаёт стандартный MediaRecorder.

---

## DC-77 (`/corruptor/`) — карта модулей

Чистые слои снизу вверх; `corruptor.js` — только DOM-обвязка.

| Файл | Ответственность | Правишь, когда… |
|------|-----------------|-----------------|
| `rng.js` | seeded PRNG (`mulberry32`+`hashStr`), `toolkit`, `r2`/`lerp` | (фундамент, редко) |
| `source.js` | `genSource(seed, opts)` → строка кода + `meta`; `ZONES`, ноты | новые ритм-шеллы, лады, голоса |
| `modules.js` | `MODULES` (RACK A, 15 live-fx) + `buildPatch()` | **добавить live-модуль** = 1 объект в массив |
| `dsp.js` | свой FFT/STFT + `POST_MODULES` (RACK B, 8 offline) + `runPost` + `CURVES` | **добавить пост-модуль** = 1 объект |
| `image.js` | IMAGE UNIT: `loadImage`/`genImage`, `synthSpectrum`/`carve`/`bend`, `applyImage` | новые режимы/мотивы картинок |
| `state.js` | `state` + `saveState`/`restoreState` (localStorage) | новые сохраняемые поля |
| `engine.js` | аудио: транспорт, буфер-луп, офлайн рендер-конвейер | тайминг записи, кэш, фейды |
| `corruptor.js` | только DOM: кнопки, дисплеи, раскладка | UI |

### Поток данных

```
seed + opts ──► source.genSource ──► modules.buildPatch ──► строка Strudel-кода
                                            │                    (source + RACK A)
                                            ▼
                             engine: captureClean (realtime) ──► чистый PCM (кэш)
                                            │
                                            ▼
                    image.applyImage → dsp.runPost (RACK B, offline JS) → фейды
                                            │
                                            ▼
                              буфер-луп превью  /  WAV файл
```

### Ключевая механика: единое превью + кэш чистого рендера

Проблема: RACK A — это Strudel-эффекты (live), а RACK B и картинка —
операции над **отрендеренными сэмплами** (их нельзя влить в живой поток).
Решение в `engine.js`:

- **PLAY** сам выбирает режим (`isCorrupt()` в `corruptor.js`):
  нет порчи → `playLive(code)` (горячая замена, мгновенно);
  включён RACK B / картинка → зацикленный офлайн-рендер.
- `captureClean(code, sec)` — **единственный** realtime-захват (source+RackA).
  Сериализован (`captureChain`), перед захватом `resumeAudio()`, есть дедлайн.
- Захваченный чистый буфер **кэшируется** по ключу `code + '#' + sec`.
- `previewProcessed(state)` при валидном кэше просто прогоняет
  `image.applyImage` + `dsp.runPost` на **копии** кэша — чистый JS, ~25–35 мс,
  без realtime. Поэтому крутить RACK B / картинку / CURVE — мгновенно.
- Меняется source/RackA/длина → код меняется → ключ кэша иной → пересъём (~2–3 c).
- `renderExact(state)` — отдельный полноразмерный рендер для REC WAV.

### Детерминизм

Всё воспроизводимо от сида. У каждого модуля свой поток: `seededRng(`${seed}:${id}:${nonce}`)`.
Кубик модуля (`⌁`) двигает только его `nonce`. Ноты идут из отдельного потока
`${seed}:notes:${noteNonce}` — `⌁ NOTES` пересобирает мелодию (порядок+высоты),
не трогая ритм/голос. `saveState` пишет только сиды+настройки (не аудио):
сгенерированная картинка возрождается из своего `imgSeed`, загруженный файл — нет.

### Как расширять

- **Live-модуль (RACK A):** добавь объект в `MODULES` (`modules.js`):
  `{ id, name, desc, stage, gen(t, amt, ctx) → { frag: '.strudelChain(...)', note: 'читаемо' } }`.
  `stage` задаёт порядок в цепочке. UI-карточка, сохранение, кубик, детерминизм —
  подхватятся сами.
- **Пост-модуль (RACK B):** добавь объект в `POST_MODULES` (`dsp.js`):
  `{ id, name, desc, process(chs, sr, amt, rng, curve) }` — мутирует `[L, R]` на месте.
  Для спектра используй `stft(ch, (re, im, tNorm) => …)`.

### Известные подводные камни (важно для правок аудио)

- Захват — **realtime** (проигрывает и пишет). Первый захват на свежей странице
  может быть медленным/тихим, пока прогреваются AudioWorklet-ы; движок сам делает
  `warmup`. Контекст засыпает между действиями → перед play/capture `resumeAudio()`.
- Буфер-луп играет на **отдельном** `AudioContext` — тоже требует `resume()`.
- В headless-тестах: второй контекст метрится тихо; надёжнее проверять **пик
  буфера**, отданного в `playLoop`, чем `getLevel()`.

---

## Тестирование (как проверяли)

Прогон через `puppeteer-core` против `http://localhost:5173`, chromium в
`/snap/bin/chromium`, флаги `--no-sandbox --autoplay-policy=no-user-gesture-required`.
`puppeteer-core` ставится временно на время проверки и удаляется после — в
runtime-зависимостях его быть не должно. Детерминированные вещи (сборка патча,
чистый DSP, генерация картинки) проверяются прямыми вызовами модулей в
`page.evaluate`; аудио-поведение — по пикам буферов и состоянию транспорта.

## Оформление

Дизайн снят с сайта matzkaim.ru (брутализм-терминал): `#000` / `#fff` / красный
`#ff0000`, `border-radius: 0`, 1px-рамки, шрифт **VT323** (`corruptor/fonts/VT323.woff2`,
подключён `@font-face`), сканлайны, монохромные 3D-клавиши с жёсткой тенью.

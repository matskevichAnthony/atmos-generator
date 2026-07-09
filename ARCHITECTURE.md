# Architecture

Справка для тех, кто продолжает разработку (человек или ИИ-агент). Описывает
проект целиком и, подробно, флагманский прибор `/corruptor/`. Держи этот файл в
актуальном состоянии при изменениях.

## Общая картина

```
server.mjs            zero-dep статик-сервер (:5173), корень = import.meta.dirname, есть MIME-карта + dir-index
index.html            главная: <strudel-editor> + навигация по приборам + REC
shared/capture.js     универсальный отвод аудио → WAV (подключён на всех страницах)
kick/ rumble/ atmos/  самостоятельные приборы-генераторы (index.html + <name>.css + <name>.js)
studio/               многослойная студия трека (layers.js = определения слоёв, экспорт стемов)
corruptor/            DC-77 DATA CORRUPTOR — самый сложный прибор, разложен на модули (см. ниже)
README.md             обзор и быстрый старт
```

Запуск: `npm install` (ставит `@strudel/web` + `@strudel/repl`), затем `npm start`
→ `http://localhost:5173`. Звук включается только после клика (autoplay policy).
Зависимости в `package.json` — ТОЛЬКО `@strudel/repl` и `@strudel/web`. Никаких
других runtime-зависимостей быть не должно (тест-инструменты вроде puppeteer
ставятся временно и удаляются; в `package.json` они не попадают).

Общие принципы:
- Движок — `@strudel/web` (в браузере superdough + core), импортируется как
  самодостаточный бандл: `import … from '/node_modules/@strudel/web/dist/index.mjs'`.
- Ключевые экспорты движка: `initStrudel`, `evaluate(code)` (компилирует и играет,
  повторный вызов = горячая замена), `hush()`, `getAudioContext()`,
  `getAudioContextCurrentTime()`, `getAnalyzerData(type,id)`.
- Vanilla JS, ES-модули, zero-build. RSJS-стиль: хуки поведения `data-js-*` (в JS
  camelCase: `data-js-preset` → `el.dataset.jsPreset`), `data-*` — данные/опции.
- Vendored ассеты самохостятся: шрифт `corruptor/fonts/VT323.woff2`, three.js и
  SVGLoader в `corruptor/vendor/`. Внешних CDN в рантайме нет.

## shared/capture.js

Классический (не-module) скрипт, подключается **первым** в `<head>` каждой
страницы. Патчит `window.AudioContext`: любой созданный контекст получает
`ScriptProcessor`-отвод, читающий мастер (monkeypatch `AudioNode.prototype.connect`:
всё, что идёт в `destination`, дублируется в отвод). API:
`startRaw`/`stopRaw` (сырой захват), `slice(raw,t,sec)` (сэмпл-точная вырезка по
времени), `makeWav`/`saveBlob` (16-bit WAV + анти-клип нормализация),
`getLevel`/`getScope` (метры), `getCapturedEnd` (ждать захват), `attach(button,opts)`.
Почему WAV: DAW не открывают webm/opus от MediaRecorder.

---

## DC-77 (`/corruptor/`) — карта модулей

Чистые слои снизу вверх; `corruptor.js` — только DOM-обвязка. Всё детерминировано
от 8-значного HEX-сида.

| Файл | Ответственность | Правишь, когда… |
|------|-----------------|-----------------|
| `rng.js` | seeded PRNG (`mulberry32`+`hashStr`), `toolkit`, `r2`/`lerp`, `randomSeedHex` | (фундамент, редко) |
| `source.js` | `genSource(seed,opts)` → строка кода + `meta`; `ZONES`, ноты, ритм-шеллы | новые лады/голоса/ритмы |
| `modules.js` | `MODULES` (RACK A, **14 live-fx**) + `buildPatch()` | **добавить live-модуль** = 1 объект |
| `dsp.js` | свой FFT/STFT + `POST_MODULES` (RACK B, **8 offline**) + `runPost` + `CURVES` + `PREVIEW_CAP?`… (нет; см. engine) | **добавить пост-модуль** = 1 объект |
| `image.js` | IMAGE UNIT: `loadImage`/`genImage`, `synthSpectrum`/`carve`/`bend`, `applyImage` | режимы/мотивы картинок |
| `presets.js` | `PRESETS` (**16** заготовок: SHOT/LOOP/DRONE) — только данные | добавить пресет |
| `state.js` | `state` + `resetState` + `saveState`/`restoreState` (localStorage) | новые сохраняемые поля |
| `engine.js` | аудио: транспорт, буфер-луп, офлайн рендер-конвейер, `PREVIEW_CAP`, clean-кэш | тайминг записи, кэш, фейды |
| `viz.js` | ambient-визуализация: фон-спектр, CRT-осциллограф, мини-дисплеи модулей | вид реактивного слоя |
| `viz-patterns.js` | 22 dot-matrix архетипа + карта `id→архетип` для мини-дисплеев | анимация конкретного модуля |
| `three3d.js` | three.js: красный экструдированный SVG-логотип (низ-право) + жуткая фоновая масса | 3D-акценты |
| `guide.js` / `guide.css` | модалка «? GUIDE» (EN), паник-плашка «RESET», кредиты → instagram | текст гайда, чром |
| `corruptor.js` | только DOM: рендер стоек/пресетов, обработчики, дисплеи, транспорт | UI и провязка |
| `vendor/` | самохостинг `three.module.js`, `SVGLoader.js` | обновление three.js |
| `assets/anton.svg` | логотип (белые блоки, тёмный фон отфильтрован в коде) → 3D | смена лого |

### Поток данных

```
seed + opts ─► source.genSource ─► modules.buildPatch ─► строка Strudel-кода (source + RACK A)
                                         │
                                         ▼
                        engine: captureClean (realtime, с ретраем) ─► чистый PCM (кэш)
                                         │
                                         ▼
                image.applyImage → dsp.runPost (RACK B, offline JS) → фейды
                                         │
                                         ▼
                            буфер-луп превью  /  WAV файл (REC)
```

### Ключевая механика: единое превью + кэш чистого рендера (`engine.js`)

Проблема: RACK A — это Strudel-эффекты (live), а RACK B и картинка — операции над
**отрендеренными сэмплами** (их нельзя влить в живой поток). Решение:

- **PLAY** сам выбирает режим (`isCorrupt()` в `corruptor.js`): нет порчи → live
  (`playLive`, горячая замена, мгновенно); включён RACK B / картинка → зацикленный
  офлайн-рендер.
- `captureClean` — единственный realtime-захват (source+RackA). Сериализован,
  перед захватом `resumeAudio()`, есть дедлайн, **повтор при тихом захвате** (иначе
  «сигнал пропадает» — тихий захват кэшировался и переиспользовался).
- Захваченный чистый буфер **кэшируется** по ключу `code + '#' + seconds`
  (`getClean`). RACK B / картинка / CURVE прогоняют `applyImage`+`runPost` на
  **копии** кэша — чистый JS, ~25–35 мс, без realtime.
- `PREVIEW_CAP = 6`: превью рендерит полную длину до порога, поэтому **PLAY == WAV**
  для длин ≤ 6с; выше — превью первые 6с (UI помечает `· ПРЕВЬЮ 6с`). `renderExact`
  (REC) переиспользует кэш превью при len ≤ cap → бит-в-бит совпадает.

### Жёсткий обрыв на переключениях (`hardSwitch` в `corruptor.js`)

`hush()` НЕ глушит хвост реверба/дилея Strudel (проверено). Поэтому дискретные
переключения (пресет / RND SOURCE / AUTO WIRE / RESET / ⌁ NOTES / SHOT-LOOP-DRONE /
регистр / тумблеры и кубики модулей) зовут `hardSwitch` = `engine.stopAll()` + `regen()`:
**жёстко обрывают старый звук перед новым**. Corrupted-режим → идеально чисто
(конечный буфер режется мгновенно). Live-режим → сухой звук с 0, но хвост реверба
Strudel звенит (его ограничение, сбросить конволвер извне нельзя). Фейдеры/ручки
остаются плавными (без обрыва). `stopLoop` **отключает** старые ноды (иначе
накапливались и глушили звук со временем).

### Детерминизм и BPM

Всё воспроизводимо от сида. У каждого модуля свой поток `seededRng(`${seed}:${id}:${nonce}`)`;
кубик модуля (`⌁`) двигает только его `nonce`. Ноты — отдельный поток
`${seed}:notes:${noteNonce}`; `⌁ NOTES` пересобирает мелодию (порядок+высоты), не
трогая ритм/голос. **BPM+такты**: `state.bpm` + `state.bars`; длина(сек) =
`bars * 240 / bpm` (4/4) → лупы ложатся в сетку DAW. Для SHOT темп/такты скрыты
(квант бессмыслен). `saveState` пишет только сиды+настройки; сгенерированная
картинка возрождается из `imgSeed`, загруженный файл — нет.

### Как расширять

- **Live-модуль (RACK A):** объект в `MODULES` (`modules.js`):
  `{ id, name, desc, stage, gen(t, amt, ctx) → { frag:'.strudelChain(...)', note:'читаемо' } }`.
  `stage` = порядок в цепочке. Опционально свой dot-matrix: добавь архетип в
  `viz-patterns.js` `ARCHETYPES` и запись `id→архетип` в `MOD_VIZ` (иначе фолбэк).
- **Пост-модуль (RACK B):** объект в `POST_MODULES` (`dsp.js`):
  `{ id, name, desc, process(chs, sr, amt, rng, curve) }` — мутирует `[L,R]` на месте.
  Для спектра используй `stft(ch, (re,im,tNorm)=>…)`.
- UI-карточка, сохранение, кубик, сид-детерминизм подхватываются автоматически.

### Визуальный / чром-слой

- `viz.js` — один rAF-цикл, читает `state`/`engine`, ничего не мутирует: фон-поле
  (халтоновые LED по мастер-спектру через свой FFT), CRT-осциллограф + мини-спектр,
  мини-дисплеи модулей (фаза идёт только когда модуль ON и играет звук). Глитч
  `.is-glitch` вешается из `corruptor.js` только при «смене реальности».
- `viz-patterns.js` — по архетипу на каждый модуль (каждый показывает, что модуль
  делает со звуком). Правило перфа: только `fillRect`/`transform/opacity`,
  `prefers-reduced-motion` отключает анимацию.
- `three3d.js` — два WebGL-канваса, оба `pointer-events:none !important` (не
  блокируют клики): красный экструдированный логотип из `assets/anton.svg` (низ-право)
  и жуткая шипастая масса (z-index 3, opacity 0.14, screen-blend, «еле заметная»).
- `guide.js`/`guide.css` — самоинжектятся: модалка «? GUIDE» (английский, суть
  «генерируй и переиспользуй, дальше — в DAW»), паник-плашка, кредиты.

### Раскладка (ветка `wide-layout`)

Корпус `max-width: min(1600px, 97vw)`, дек в один ряд из 3 равновысоких модулей
(`align-items: stretch`), RACK A 14 → 2 ряда, RACK B 8 → 1 ряд. **CRT-экран
`sticky`** — осциллограф/сид/статус остаются на виду при скролле к стойкам. IMAGE-
модуль — flex-колонка, превью картинки `flex:1` (крупное прямоугольное, тянется на
всю высоту блока).

### Известные подводные камни

- Захват — realtime (проигрывает и пишет). Первый захват на свежей странице может
  быть медленным/тихим (прогрев worklet-ов) → есть `warmup` + ретрай тихого захвата.
- Контекст засыпает между действиями → перед play/capture `resumeAudio()`.
- Буфер-луп играет на **отдельном** `AudioContext` — тоже требует `resume()`.
- Хвост реверба Strudel не глушится `hush()` — см. `hardSwitch` выше.
- В headless-тестах: второй контекст метрится тихо; надёжнее проверять **пик
  буфера**, отданного в `playLoop`, чем `getLevel()`.

---

## Тестирование

Прогон через `puppeteer-core` против `http://localhost:5173`, chromium в
`/snap/bin/chromium`, флаги `--no-sandbox --autoplay-policy=no-user-gesture-required`
(для WebGL добавить `--enable-unsafe-swiftshader`). `puppeteer-core` ставится
**временно** и удаляется после (в `package.json` его быть не должно; после игр с
ним делай `git checkout -- package.json package-lock.json`). Детерминированные вещи
(сборка патча, чистый DSP `dsp.js`, генерация картинки) проверяются прямыми вызовами
модулей в Node/`page.evaluate`; аудио — по пикам буферов и состоянию транспорта.
Окружение бывает капризным (виснут запуски chromium, npm через прокси тормозит) —
тогда опирайся на статическую проверку (`node --check`, `grep`, serve-коды).

## Оформление и ветки

Дизайн снят с сайта matzkaim.ru: брутализм-терминал, `#000`/`#fff`/красный `#ff0000`,
`border-radius:0`, шрифт VT323, сканлайны, монохромные 3D-клавиши.
Ветки: `main` (релиз) + рабочие ветки под темы (напр. `wide-layout`). Коммиты на
английском, imperative, ≤50 симв. первая строка. Атрибуция авторства чужим
инструментам в коммитах/артефактах не добавляется.

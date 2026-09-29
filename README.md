# SVOD — Person Intelligence

OSINT-стол для идентификации публичных людей: расследование, а не чат с LLM и не «поисковик по людям».

Открытый веб и исторические цифровые артефакты собираются в **проверяемый граф свидетельств**. Каждый факт связан с источником и несёт статус:

`OBSERVED` · `HYPOTHESIS` · `SUPPORTED` · `CONFIRMED` · `CONFLICT` · `UNVERIFIED` · `REJECTED`

Найденное **не считается автоматически истинным**. Имя без второго независимого сигнала ≠ «тот же человек». Пустое поле не добивается догадкой. Интерфейс не подставляет фейковые фото и не ставит «Идентифицирована», пока identity-слой этого не сказал.

## Цикл агента

```
User → Investigation → Search Planner → Tool (methodology)
     → Sources → Extraction → Entities → Facts
     → Entity Resolution → Evidence Graph → Contradiction Detection
     → Next Tool → … → stop (identity / search down / limit)
```

Каждый метод — отдельный **tool**: имя, JSON-схема, `execute`, observation. Модули независимы (`google-dorks`, `search-engines`, `digital-search`, `person-intel`, …).

Планировщик:

`score = information_gain × source_quality × identity_relevance − cost − duplicate_probability`

Стоп, когда личность подтверждена ≥2 независимыми сигналами, поисковый стек недоступен (`tls`/`network` — не жжём итерации), или исчерпан лимит.

## Поиск

Официальные API, не HTML-скрейп `google.com` / `yandex.ru`:

| Tool | API | Credentials |
|---|---|---|
| `google_search` | [Google Custom Search JSON](https://developers.google.com/custom-search/v1/overview) | `google_api_key` + `google_cx` |
| `yandex_search` | [Yandex Search XML](https://yandex.com/dev/xml/) | `yandex_user` + `yandex_api_key` |

Без ключей tools **fail closed**: `error: config`, пустые hits, без фейковых сниппетов.

`web_search` / `multi_engine_search`: сначала keyed API, затем публичные HTML-движки (DuckDuckGo → Brave → Bing → Mojeek → DDG Lite). `tls` / `empty` / `config` ≠ успех.

Также: Wikipedia, Wikidata, Wayback CDX, dorks, speaker/conference/company pages, GitHub, публичные сниппеты HH/LinkedIn (без логина).

## Настройки

Ключи хранятся только на хосте, в `/api/settings` **не возвращаются** (только `*_set` и публичный CX / Yandex user).

| Setting / env | Назначение |
|---|---|
| `llm_api_key` · `SVOD_LLM_API_KEY` / `OPENAI_API_KEY` | LLM (опционально) |
| `google_api_key` · `SVOD_GOOGLE_API_KEY` / `GOOGLE_API_KEY` | Google CSE |
| `google_cx` · `SVOD_GOOGLE_CX` / `GOOGLE_CSE_ID` | Search Engine ID |
| `yandex_user` · `SVOD_YANDEX_USER` / `YANDEX_USER` | логин XML API |
| `yandex_api_key` · `SVOD_YANDEX_API_KEY` / `YANDEX_API_KEY` | ключ XML API |

UI: **Настройки** — LLM, Google, Yandex, вкл/выкл модулей и отдельных tools.

## Стек

| Слой | Реализация |
|---|---|
| Frontend | React 18, TypeScript, Vite — Person Intelligence desk |
| Backend | Node.js 22, Fastify, TypeScript |
| БД | SQLite (`node:sqlite`) |
| Очередь | in-process agent loop |
| Поиск | Google CSE, Yandex XML, HTML-движки, Wikipedia/Wikidata |
| Архивы | Wayback Machine CDX |
| HTML | Cheerio, robots.txt |
| PDF | pdf-lib + извлечение строк |
| Граф | табличная модель Evidence Graph |
| Хранилище | `data/assets/original` (оригинал не перезаписывается) |

## Стратегия источников

Диспетчер выбирает **preset** по роли и известным идентификаторам — это выбор следующего действия, не оценка человека.

| Цель | Источники (порядок) |
|---|---|
| CEO / public executive | сайт, СМИ, YouTube, конференции, отчёты, архив |
| Middle manager | PDF/отчёты, сайт, архив, конференции |
| Low-publicity | документы, email, username, мероприятия |
| Known email | local-part → username hypothesis |
| Known INN | только разрешённый публичный реестр; **ИНН ≠ должность**, org INN ≠ personal INN |

Inference никогда не становится фактом. Три копии одного пресс-релиза — один источник. Старый официальный документ — `HISTORICAL`, не «текущая должность».

## Юридические ограничения

- Только publicly available information
- robots.txt, rate-limit, идентифицируемый User-Agent
- Нет логин-скрейпа, paywall bypass, закрытых баз и непубличных ПДн
- Нет обхода Google/Yandex HTML; только официальные API + открытые HTML-движки
- Атрибуция источника, audit log

## Запуск

```bash
npm run install:all
npm run dev:api     # :3001
npm run dev:web     # :5173  (проксирует /api)
npm test            # backend, ~85 тестов
```

Демо `INV-000001` уже засеяно. Новое расследование запускает живой цикл по открытым источникам.

## Объекты

Person · Organization · Document · Image · Source · Fact · Evidence

`Fact ← Evidence ← Source`  и  `Source A —COPIED_FROM→ Source B` (независимость источников).

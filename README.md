# SVOD — OSINT Investigation & Evidence Intelligence Platform

Версия 1.0. Web-приложение + API + асинхронный investigation-агент.

SVOD — не «поисковик по людям» и не `User → Prompt → LLM → Answer`. Это система управления расследованием: она превращает открытый веб и исторические цифровые артефакты в **проверяемый граф свидетельств**.

Каждый факт связан с источником и несёт статус:

`OBSERVED` · `HYPOTHESIS` · `SUPPORTED` · `CONFIRMED` · `CONFLICT` · `UNVERIFIED` · `REJECTED`

Система **не считает найденное автоматически истинным**. EXIF, OCR и совпадение лица — это evidence, не доказательство личности. Незаполненное поле не добивается догадкой.

## Цикл агента

```
User → Investigation → Search Planner → Search → Sources
     → Documents / Images / Archives → Extraction → Entities → Facts
     → Entity Resolution → Evidence Graph → Contradiction Detection
     → Next Search → … → Final Report
```

Планировщик оценивает действия:

`score = information_gain × source_quality × identity_relevance − cost − duplicate_probability`

Остановка, когда критические поля идентичности подтверждены независимыми источниками и нет неразрешённого критического противоречия.

## Стек MVP-1

| Слой | Реализация |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js 22, Fastify, TypeScript |
| БД | SQLite (`node:sqlite`) — схема как в ТЗ (PostgreSQL-ready) |
| Очередь | in-process agent loop (BullMQ/Redis — следующий этап) |
| Поиск | DuckDuckGo HTML, Wikipedia, Wikidata |
| Архивы | Wayback Machine CDX |
| HTML | Cheerio, robots.txt |
| PDF | pdf-lib + извлечение строк |
| EXIF | exifr |
| Граф | табличная модель Evidence Graph |
| Хранилище | локальные `data/assets/original` (оригинал не перезаписывается) |

Neo4j, Qdrant, Playwright, PaddleOCR, face embeddings — заложены в архитектуре, подключаются в MVP-2/3.

## Юридические ограничения

- Только publicly available information
- Соблюдение robots.txt, rate-limit по домену, идентифицируемый User-Agent
- Нет обхода аутентификации, paywall, закрытых баз и непубличных ПДн
- Атрибуция источника, контроль хранения, audit log
- Файлы обрабатываются как потенциально вредоносные (sandbox — следующий этап)

## Запуск

```bash
npm run install:all
npm run dev:api     # :3001
npm run dev:web     # :5173  (проксирует /api)
```

Откройте веб-интерфейс. Демо-расследование `INV-000001` уже засеяно:

*Identification of Fedor Mikhailovich* — ФИО CONFIRMED, должность CONFIRMED, организация CONFIRMED, дата рождения CONFLICT (1981 vs 1982, UNRESOLVED), место рождения UNVERIFIED.

Новое расследование запускает живой цикл по открытым источникам.

## Объекты

Person · Organization · Document · Image · Source · Fact · Evidence

`Fact ← Evidence ← Source`  и  `Source A —COPIED_FROM→ Source B` (независимость источников).

Временная модель факта: `event_date / document_date / publication_date / archive_date / discovery_date`.

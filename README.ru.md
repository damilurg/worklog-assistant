[English version](README.md)

# GitLab → Jira Worklog Assistant

Self-hosted приложение на TypeScript, которое собирает активность из GitLab, сопоставляет её с задачами Jira, хранит состояние синхронизации в PostgreSQL и готовит данные для учёта времени.

Сейчас в репозитории реализован MVP с основным интерфейсом через CLI. Приложение читает worklog из Jira, но не записывает новые автоматически: подтверждение пользователем остаётся обязательной границей продукта.

## Что реализовано

- Синхронизация коммитов, Merge Request и review-комментариев из нескольких экземпляров и проектов GitLab.
- Идемпотентное хранение данных в PostgreSQL через Drizzle ORM.
- Извлечение ключей задач Jira из текста активности.
- Просмотр активности и группировка по дням и задачам Jira.
- Синхронизация задач и worklog из Jira.
- CSV-экспорт для Jira с распределением восьмичасового рабочего дня; JSON также доступен.
- Русскоязычный stand-up отчёт, объединяющий активность GitLab и worklog Jira.
- Health-check Fastify API по адресу `GET /health`.

Подтверждение плана, запись worklog в Jira, полноценный REST API и Web UI остаются в плане развития.

## Требования

- Node.js 24 или новее
- pnpm
- Docker с Docker Compose либо совместимый PostgreSQL

## Установка

```powershell
Copy-Item .env.example .env
pnpm install
docker compose up -d
pnpm --filter @worklog-assistant/db exec drizzle-kit push
pnpm build
```

Перед синхронизацией заполните `.env`. Доступные настройки перечислены в [.env.example](.env.example).

## CLI

После `pnpm build` используйте короткие команды из корня репозитория:

```bash
pnpm gitlab                         # GitLab за вчера
pnpm jira                           # Jira за вчера
pnpm sync                           # GitLab + Jira за вчера
pnpm sync --period half-year        # GitLab + Jira за полгода
pnpm standup                        # стендап за вчера
pnpm standup --date 2026-09-29      # стендап за дату
pnpm report                         # синхронизировать всё и создать worklogs.csv за вчера
pnpm report --period half-year      # синхронизировать полгода и создать worklogs.csv
pnpm report:json                    # синхронизировать всё и создать worklogs.json за вчера
pnpm finish                         # завершить сегодня: синк, CSV, JSON и стендап
pnpm get:report                     # завершить сегодня: только CSV и JSON
pnpm get:standup                    # завершить сегодня: только стендап
pnpm activity --from 2026-09-01
pnpm day 2026-09-29
```

Все флаги диапазона передаются в CLI. Перед построением отчёта выполняется синхронизация GitLab и Jira, которая обновляет нормализованную activity. Сгенерированные `worklogs.csv` и `worklogs.json` исключены из Git.

В конце рабочего дня запускайте `pnpm finish` без дат. Команда берёт сегодняшнюю дату в `TIMEZONE`, один раз синхронизирует оба источника, создаёт готовые к загрузке `worklogs.csv` и `worklogs.json`, а также сохраняет и печатает `standup.md`. Повторный запуск использует покрытие синхронизации; `pnpm finish --force` нужен только для полного обновления.

Заголовки стендапа всегда содержат точную дату и, когда применимо, подписи «Сегодня», «Завтра» и «Вчера».

Успешно обработанные пары «источник/дата» сохраняются в `sync_coverage` вместе с безопасным отпечатком конфигурации без токенов. Повтор той же команды пропускает покрытые даты без обращений к API, а пробелы объединяются в минимальные непрерывные интервалы. Изменение экземпляров, проектов, авторов или настроек Jira автоматически создаёт новую область покрытия. Используйте `--force`, только когда дату действительно нужно загрузить заново:

```bash
pnpm sync --from 2026-09-01 --to 2026-09-30 --force
pnpm report --from 2026-09-01 --to 2026-09-30 --force
```

GitLab повторяет сетевые ошибки, rate limit и временные ошибки сервера не более трёх раз с экспоненциальной задержкой. При ошибках авторизации, прав или отсутствии ресурса выполнение прекращается сразу. Неудачный диапазон никогда не отмечается обработанным.

В объединённых командах синхронизации и экспорта оба источника работают в режиме best-effort: если GitLab или Jira недоступны, команда выводит отдельное предупреждение для источника и продолжает работу с данными, уже сохранёнными в PostgreSQL. Неудачный диапазон не отмечается синхронизированным и будет повторён при следующем запуске. Отдельные команды `pnpm gitlab` и `pnpm jira` по-прежнему завершаются с ошибкой, чтобы мониторинг не пропустил сбой.

В комментарии отчёта используется название задачи Jira, выводятся не более двух уникальных событий GitLab, а остаток сворачивается в счётчик.

Полный собранный CLI также доступен:

```bash
# GitLab + Jira за вчера (по умолчанию)
node apps/cli/dist/index.js sync
# Готовые периоды истории, заканчивающиеся вчера
node apps/cli/dist/index.js sync --period week
node apps/cli/dist/index.js sync --period month
node apps/cli/dist/index.js sync --period half-year
node apps/cli/dist/index.js sync --period year
# Явный период для общей или отдельной синхронизации
node apps/cli/dist/index.js sync --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js gitlab sync --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js jira sync --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js activity --from 2026-09-01 --to 2026-09-30
node apps/cli/dist/index.js day 2026-09-30
node apps/cli/dist/index.js export --from 2026-09-01 --to 2026-09-30 --format csv > worklogs.csv
# Дополнительный структурированный формат
node apps/cli/dist/index.js export --from 2026-09-01 --to 2026-09-30 --format json
node apps/cli/dist/index.js report
node apps/cli/dist/index.js report --date 2026-09-29
```

Синхронизация и экспорт по умолчанию работают за вчера. Явные даты `--from/--to` имеют приоритет над `--period`. Отчёт также по умолчанию строится за вчера. Полный список команд: `node apps/cli/dist/index.js --help`.

### Ежедневный запуск по расписанию

Запускайте `node apps/cli/dist/index.js sync` один раз утром. В Windows Task Scheduler укажите `node` как программу, абсолютный путь `apps/cli/dist/index.js sync` как аргументы, а корень репозитория — в поле **Start in**. Для Linux/macOS пример запуска по будням:

```cron
0 9 * * 1-5 cd /path/to/worklog-assistant && node apps/cli/dist/index.js sync
```

## Переменные окружения

| Переменная             | Обязательна   | Назначение                                                                                            |
| ---------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Да            | Строка подключения к PostgreSQL.                                                                      |
| `GITLAB_INSTANCES`     | Для GitLab    | JSON-массив объектов `{ url, token, projectIds }`. Токену нужны права `read_api` и `read_repository`. |
| `GITLAB_AUTHOR_EMAILS` | Рекомендуется | Email авторов коммитов через запятую.                                                                 |
| `GITLAB_AUTHOR_NAMES`  | Рекомендуется | Имена авторов GitLab/коммитов через запятую.                                                          |
| `JIRA_URL`             | Для Jira      | URL сайта Jira.                                                                                       |
| `JIRA_EMAIL`           | Для Jira      | Email учётной записи Jira.                                                                            |
| `JIRA_TOKEN`           | Для Jira      | API-токен Jira.                                                                                       |
| `JIRA_AUTH_MODE`       | Нет           | `cloud` для Basic/API v3 или `data-center` для Bearer PAT/API v2. По умолчанию `cloud`.               |
| `WORKDAY_HOURS`        | Нет           | Длина рабочего дня, по умолчанию `8`.                                                                 |
| `TIMEZONE`             | Нет           | Часовой пояс IANA, по умолчанию `Asia/Bishkek`.                                                       |

Не добавляйте `.env` в Git: файл намеренно исключён.

## Проверки качества

```bash
pnpm test
pnpm lint
pnpm build
```

## Документация

- [English README](README.md)


## Development graph / Граф разработки

После обычной настройки проекта запусти `pnpm graph` и открой http://localhost:3000. Команда соберёт монорепу и запустит API с Angular-интерфейсом. Используются существующие PostgreSQL, GitLab/Jira-клиенты и `.env`. Новая база и миграция не нужны.

```bash
pnpm graph        # реальные сохранённые данные
pnpm graph:demo   # демограф без внешних API и PostgreSQL
```

На странице выбери диапазон дат и нажми «Показать период» для чтения базы либо «Синхронизировать» для запуска существующего CLI `sync`. Команда не пишет worklogs в Jira. CLI сохраняет свою best-effort семантику: при отказе одного источника доступны старые данные; предупреждения остаются в серверных логах. Поиск, фильтры типов, детали узла, переходы в источники, масштаб и фокус на один/два уровня связей доступны в интерфейсе.

Граф показывает проекты, коммиты, MR, задачи и worklogs. Связи извлекаются из уже сохранённых `detectedIssueKeys`, сообщений коммитов и MR/веток. Принадлежность коммита конкретному MR не выдумывается: такой связи пока нет в хранилище. GitLab commit authors и Jira worklog authors имеют отдельные идентификаторы. Данные отражают активность, отфильтрованную существующим CLI, а не всё содержимое GitLab.

`GET /api/graph?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100`, `POST /api/sync` с теми же query-параметрами. Даты графа трактуются в UTC, как и явные `--from/--to` существующего CLI. По умолчанию берутся последние 30 календарных дат UTC, до 100 записей каждого источника, предел 500. При усечении UI показывает предупреждение. База читается в read-only repeatable-read транзакции.

API по умолчанию слушает localhost. `GRAPH_API_KEY` включает проверку `x-api-key`; ключ вводится в настройках интерфейса и остаётся только в памяти вкладки. Для Docker задай этот ключ; порт опубликован только на loopback. Для публичной эксплуатации нужны пользовательская авторизация и TLS. Токены GitLab/Jira не возвращаются в браузер.

Разработка Angular: `pnpm graph:dev` (порт 4200, proxy на API 3000). Для проверки: `pnpm test`, `pnpm lint`, `pnpm build`. Angular находится в `apps/web`, чистый преобразователь данных графа и API — в `apps/api`, контракт — в `packages/shared/src/graph.ts`.

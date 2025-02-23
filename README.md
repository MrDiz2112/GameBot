# Game Tracking Bot

Telegram бот для отслеживания игр и их цен. Поддерживает добавление игр из Steam, отслеживание цен и категоризацию игр.

## Возможности

- Добавление игр из Steam
- Автоматический парсинг информации об игре (название, цена, теги)
- Автоматическое отслеживание изменения цен каждые 24 часа
- Уведомления о скидках в выбранных топиках групп
- Категории игр
- Группы пользователей с возможность позвать их

## Установка

### Локальная установка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd game-bot
```

2. Установите зависимости:
```bash
npm install
```

3. Скопируйте `.env.example` в `.env` и настройте переменные окружения:
```bash
cp .env.example .env
```

4. Отредактируйте `.env` файл:
```
BOT_TOKEN=your_telegram_bot_token
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gamebot?schema=public"
```

5. Инициализируйте базу данных:
```bash
npm run prisma:generate
npm run prisma:migrate
```

### Установка с помощью Docker

#### Разработка

1. Скопируйте `.env.example` в `.env` и настройте переменные
2. Запустите контейнеры для разработки:
```bash
docker-compose -f docker-compose.dev.yml up -d
```

#### Продакшен

1. Настройте переменные окружения
2. Запустите продакшен окружение:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Запуск

### Локальный запуск

Для разработки:
```bash
npm run dev
```

Для продакшена:
```bash
npm run build
npm start
```

### Docker команды

```bash
# Разработка
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml logs -f

# Продакшен
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml logs -f

# Остановка
docker-compose -f docker-compose.prod.yml down

# Остановка с удалением данных
docker-compose -f docker-compose.prod.yml down -v
```

## Разработка

### Доступные скрипты

- `npm run dev` - Запуск в режиме разработки
- `npm run build` - Сборка проекта
- `npm start` - Запуск собранного проекта
- `npm run lint` - Проверка кода линтером
- `npm run lint:fix` - Исправление ошибок линтера
- `npm run format` - Форматирование кода
- `npm run format:check` - Проверка форматирования
- `npm run prisma:generate` - Генерация Prisma клиента
- `npm run prisma:migrate` - Применение миграций
- `npm run prisma:studio` - Запуск Prisma Studio

### Зависимости

Основные:
- Node.js 20+
- TypeScript 5.3+
- Grammy 1.21+
- Prisma 5.10+
- PostgreSQL 15+
- Winston 3.17+

## Использование

### Настройка бота

1. Добавьте бота в группу с топиками (супергруппу)
2. Создайте топик для уведомлений о скидках
3. В нужном топике используйте команду `/set_notifications`
4. Бот будет отправлять уведомления о скидках в этот топик

### Команды бота

В группе доступны следующие команды:

- `/start` - Начать работу с ботом
- `/help` - Показать помощь
- `/add` - Добавить новую игру
- `/list` - Показать список игр
- `/check_prices` - Проверить цены
- `/categories` - Показать список категорий и количество игр в них
- `/add_category` - Добавить новую категорию (Пример: `/add_category Стратегии`)
- `/edit_category` - Изменить категорию игры
- `/edit_players` - Изменить количество игроков для игры
- `/delete` - Удалить игру из списка
- `/play` - Найти игры по количеству игроков (Пример: `/play 4`)
- `/create_party` - Создать новую группу пользователей
- `/party` - Позвать группу пользователей
- `/set_notifications` - Настроить уведомления о скидках в текущем топике
- `/remove_notifications` - Отключить уведомления в текущем топике

### Уведомления о скидках

Бот автоматически проверяет цены на игры каждые 24 часа. При обнаружении скидки, бот отправит уведомление в настроенный топик группы.

## Структура проекта

```text
.
├── src/              # Исходный код
├── prisma/           # Схема и миграции базы данных
├── dist/             # Скомпилированный код
├── logs/             # Логи приложения
├── data/             # Данные приложения
└── docker/           # Docker конфигурации
```

## Технологии

- Node.js & TypeScript
- Grammy (Telegram Bot Framework)
- Prisma (ORM)
- PostgreSQL
- Winston

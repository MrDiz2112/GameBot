import { Bot, Context, session, SessionFlavor, InlineKeyboard } from 'grammy';
import { IGameService, IGame } from '../types';
import { NotificationService } from '../services/NotificationService';
import logger from '../utils/logger';

interface SessionData {
  gameUrl?: string;
  category?: string;
  awaitingCategories?: boolean;
  awaitingPlayers?: boolean;
  players?: number;
}

type BotContext = Context & SessionFlavor<SessionData>;

export class GameBot {
  private bot: Bot<BotContext>;
  private gameService: IGameService;
  private notificationService: NotificationService;

  constructor(token: string, gameService: IGameService) {
    this.bot = new Bot<BotContext>(token);
    this.gameService = gameService;
    this.notificationService = new NotificationService(this.bot, gameService);

    this.bot.use(
      session({
        initial: (): SessionData => ({
          gameUrl: undefined,
          category: undefined,
          awaitingCategories: false,
          awaitingPlayers: false,
          players: undefined,
        }),
      })
    );

    this.setupCommands();
    this.setupPriceChecking();
    logger.info('GameBot initialized');
  }

  private setupCommands(): void {
    this.bot.command('start', this.handleStart.bind(this));
    this.bot.command('add', this.handleAdd.bind(this));
    this.bot.command('list', this.handleList.bind(this));
    this.bot.command('check_prices', this.handleCheckPrices.bind(this));
    this.bot.command('help', this.handleHelp.bind(this));
    this.bot.command('set_notifications', this.handleSetNotifications.bind(this));
    this.bot.command('remove_notifications', this.handleRemoveNotifications.bind(this));
    this.bot.command('categories', this.handleCategories.bind(this));
    this.bot.command('add_category', this.handleAddCategory.bind(this));

    // Handle URL input after /add command
    this.bot.on('message:text', this.handleMessage.bind(this));

    // Добавляем обработчик для inline кнопок категорий
    this.bot.callbackQuery(/^category:(.+)$/, async ctx => {
      if (!ctx.match[1]) return;

      const category = ctx.match[1];
      const chatId = ctx.chat?.id;

      if (!chatId || !ctx.session.gameUrl || !ctx.session.awaitingCategories) {
        await ctx.answerCallbackQuery({
          text: '❌ Ошибка: сессия выбора категории не активна',
          show_alert: true,
        });
        return;
      }

      const processingMsg = await ctx.reply('⏳ Добавляю игру...');

      try {
        const game: IGame = {
          url: ctx.session.gameUrl,
          platform: 'steam',
          category: category,
          players: ctx.session.players || 1,
          basePrice: 0,
          currentPrice: 0,
          title: '', // Will be parsed
        };

        await this.gameService.addGame(game);

        // Удаляем клавиатуру
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });

        await ctx.answerCallbackQuery({
          text: '✅ Категория выбрана',
        });

        if (processingMsg.message_id) {
          await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        }

        await ctx.reply('✅ Игра успешно добавлена!');

        // Очищаем сессию
        ctx.session.gameUrl = undefined;
        ctx.session.category = undefined;
        ctx.session.awaitingCategories = false;
        ctx.session.players = undefined;
        ctx.session.awaitingPlayers = false;
      } catch (error) {
        logger.error('Error adding game with category', {
          chatId,
          category,
          error,
        });

        await ctx.answerCallbackQuery({
          text: '❌ Произошла ошибка при добавлении игры',
          show_alert: true,
        });

        if (processingMsg.message_id) {
          await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        }
      }
    });

    this.bot.api.setMyCommands([
      {
        command: 'start',
        description: 'Начать работу с ботом',
      },
      {
        command: 'add',
        description: 'Добавить новую игру',
      },
      {
        command: 'list',
        description: 'Показать список игр',
      },
      {
        command: 'check_prices',
        description: 'Проверить цены',
      },
      {
        command: 'categories',
        description: 'Показать список категорий и количество игр в них',
      },
      {
        command: 'add_category',
        description: 'Добавить новую категорию',
      },
      {
        command: 'set_notifications',
        description: 'Настроить уведомления о скидках в текущем топике',
      },
      {
        command: 'remove_notifications',
        description: 'Отключить уведомления в текущем топике',
      },
      {
        command: 'help',
        description: 'Показать помощь',
      },
    ]);
  }

  private setupPriceChecking(): void {
    // Проверяем цены каждые 24 часа
    setInterval(
      () => {
        this.notificationService.checkPricesAndNotify().catch(error => {
          console.error('Failed to check prices:', error);
        });
      },
      24 * 60 * 60 * 1000
    );
  }

  private async handleStart(ctx: BotContext): Promise<void> {
    const isGroup = ctx.chat?.type === 'supergroup';
    const message = isGroup
      ? 'Привет! Я бот для отслеживания игр. \n\n' +
        'Доступные команды:\n' +
        '/add - Добавить новую игру\n' +
        '/list - Показать список игр\n' +
        '/check_prices - Проверить цены\n' +
        '/categories - Показать список категорий и количество игр\n' +
        '/add_category - Добавить новую категорию\n' +
        '/set_notifications - Настроить уведомления о скидках в текущем топике\n' +
        '/remove_notifications - Отключить уведомления в текущем топике\n' +
        '/help - Показать помощь'
      : 'Привет! Я бот для отслеживания игр. \n\n' +
        'Для использования бота добавьте меня в группу с топиками.\n' +
        'Там вы сможете настроить уведомления о скидках в нужном топике.';

    await ctx.reply(message);
  }

  private async handleAdd(ctx: BotContext): Promise<void> {
    logger.debug('Handling /add command', { chatId: ctx.chat?.id });

    const url = ctx.match;
    if (!url) {
      await ctx.reply('Пожалуйста, используйте формат: /add <ссылка на игру в Steam>');
      return;
    }

    if (!url.toString().includes('store.steampowered.com')) {
      await ctx.reply('Пожалуйста, предоставьте корректную ссылку на игру в Steam');
      return;
    }

    const processingMsg = await ctx.reply('⏳ Обрабатываю ссылку...');

    try {
      const parsedGame = await this.gameService.parser.parseGame(url.toString());

      if (!parsedGame.title) {
        logger.warn('Failed to parse game title', { chatId: ctx.chat?.id, url });
        await ctx.reply(
          '❌ Не удалось получить информацию об игре. Проверьте ссылку и попробуйте снова.'
        );
        if (ctx.chat?.id) {
          await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
        }
        return;
      }

      ctx.session.gameUrl = url.toString();
      ctx.session.awaitingPlayers = true;
      logger.info('Successfully parsed game', {
        chatId: ctx.chat?.id,
        url,
        title: parsedGame.title,
      });

      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply(
        `✅ Игра найдена: ${parsedGame.title}\n` + 'Укажите количество игроков (по умолчанию: 1)'
      );
    } catch (error) {
      logger.error('Error processing Steam URL', { chatId: ctx.chat?.id, url, error });
      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply('❌ Произошла ошибка при обработке ссылки. Попробуйте позже.');
    }
  }

  private async handleMessage(ctx: BotContext): Promise<void> {
    const text = ctx.message?.text;
    const chatId = ctx.chat?.id;

    if (!text || !chatId) {
      logger.warn('Received message without text or chatId');
      return;
    }

    logger.debug('Processing message', { chatId, text: text.substring(0, 50) });

    if (ctx.session.gameUrl && ctx.session.awaitingPlayers) {
      const players = parseInt(text);
      if (isNaN(players) || players < 1) {
        await ctx.reply('Пожалуйста, укажите корректное количество игроков (целое число больше 0)');
        return;
      }

      ctx.session.players = players;
      ctx.session.awaitingPlayers = false;
      ctx.session.awaitingCategories = true;

      // Получаем все существующие категории из базы данных
      try {
        const categories = await this.gameService.getCategories();
        const keyboard = new InlineKeyboard();

        // Добавляем кнопки с категориями по 2 в ряд
        for (let i = 0; i < categories.length; i += 2) {
          const row = [categories[i]];
          if (i + 1 < categories.length) {
            row.push(categories[i + 1]);
          }
          keyboard.text(row[0], `category:${row[0]}`);
          if (row.length > 1) {
            keyboard.text(row[1], `category:${row[1]}`);
          }
          keyboard.row();
        }

        await ctx.reply('Выберите категорию игры:', { reply_markup: keyboard });
      } catch (error) {
        logger.error('Error getting categories', { error });
        await ctx.reply('Произошла ошибка при получении списка категорий');
      }
      return;
    }

    if (ctx.session.gameUrl && ctx.session.awaitingCategories) {
      logger.info('Processing category', { chatId, category: text });
      const processingMsg = await ctx.reply('⏳ Добавляю игру...');

      try {
        const game: IGame = {
          url: ctx.session.gameUrl,
          platform: 'steam',
          category: text,
          players: ctx.session.players || 1,
          basePrice: 0,
          currentPrice: 0,
          title: '', // Will be parsed
        };

        logger.debug('Adding game with data', { game });
        await this.gameService.addGame(game);
        logger.info('Game successfully added', {
          chatId,
          url: ctx.session.gameUrl,
          category: text,
          players: ctx.session.players,
        });

        await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        await ctx.reply('✅ Игра успешно добавлена!');
      } catch (error) {
        logger.error('Error adding game', {
          chatId,
          url: ctx.session.gameUrl,
          category: text,
          error,
        });
        await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        await ctx.reply('❌ Произошла ошибка при добавлении игры. Попробуйте еще раз.');
      }

      ctx.session.gameUrl = undefined;
      ctx.session.category = undefined;
      ctx.session.awaitingCategories = false;
      ctx.session.players = undefined;
      ctx.session.awaitingPlayers = false;
    }
  }

  private async handleList(ctx: BotContext): Promise<void> {
    try {
      const games = await this.gameService.getGames();
      if (games.length === 0) {
        await ctx.reply('Список игр пуст');
        return;
      }

      // Группируем игры по категориям
      const gamesByCategory = games.reduce(
        (acc, game) => {
          const category = game.category || 'Без категории';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(game);
          return acc;
        },
        {} as Record<string, typeof games>
      );

      // Формируем сообщение
      const message = Object.entries(gamesByCategory)
        .map(([category, categoryGames]) => {
          const header = `*__${category}__*\n\n`;
          const gamesList = categoryGames
            .map(game => {
              const name = `[${game.title}](${game.url})`;
              const price = `${game.basePrice > game.currentPrice ? `~${game.basePrice}~ ` : ''}${game.currentPrice || 'Н/Д'} руб\\.`;
              const players = `${game.players} чел\\.`;
              return `\\- ${name} \\(${players}\\) \\- ${price}`;
            })
            .join('\n');
          return `${header}${gamesList}`;
        })
        .join('\n\n');

      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      logger.error('Error getting game list', { error });
      await ctx.reply('Произошла ошибка при получении списка игр');
    }
  }

  private async handleCheckPrices(ctx: BotContext): Promise<void> {
    try {
      const games = await this.gameService.getGames();
      for (const game of games) {
        logger.info('Updating price for game', { id: game.id });

        if (game.id) {
          await this.gameService.updatePrice(game.id);
        } else {
          logger.warn('Game has no id', { game });
        }
      }
      await ctx.reply('Цены успешно обновлены! Используйте /list чтобы увидеть актуальные цены.');
    } catch (error) {
      await ctx.reply('Произошла ошибка при обновлении цен');
    }
  }

  private async handleSetNotifications(ctx: BotContext): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      const threadId = ctx.message?.message_thread_id;

      if (!chatId) {
        await ctx.reply('Ошибка: не удалось определить чат.');
        return;
      }

      if (ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Эта команда доступна только в группах с топиками.');
        return;
      }

      if (!threadId) {
        await ctx.reply('Эта команда должна быть использована в топике.');
        return;
      }

      await this.notificationService.setNotificationThread(chatId, threadId);
      await ctx.reply('Уведомления о скидках будут приходить в этот топик!');
    } catch (error) {
      await ctx.reply('Произошла ошибка при настройке уведомлений.');
    }
  }

  private async handleRemoveNotifications(ctx: BotContext): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      const threadId = ctx.message?.message_thread_id;

      if (!chatId) {
        await ctx.reply('Ошибка: не удалось определить чат.');
        return;
      }

      if (ctx.chat?.type !== 'supergroup') {
        await ctx.reply('Эта команда доступна только в группах с топиками.');
        return;
      }

      if (!threadId) {
        await ctx.reply('Эта команда должна быть использована в топике.');
        return;
      }

      await this.notificationService.removeNotificationSettings(chatId, threadId);
      await ctx.reply('Уведомления о скидках отключены для этого топика.');
    } catch (error) {
      await ctx.reply('Произошла ошибка при отключении уведомлений.');
    }
  }

  private async handleHelp(ctx: BotContext): Promise<void> {
    const isGroup = ctx.chat?.type === 'supergroup';
    const message = isGroup
      ? 'Команды бота:\n\n' +
        '/add - Добавить новую игру\n' +
        '/list - Показать список игр\n' +
        '/check_prices - Проверить цены\n' +
        '/categories - Показать список категорий и количество игр\n' +
        '/add_category - Добавить новую категорию\n' +
        '/set_notifications - Настроить уведомления о скидках в текущем топике\n' +
        '/remove_notifications - Отключить уведомления в текущем топике\n' +
        '/help - Показать это сообщение\n\n' +
        'Для добавления игры:\n' +
        '1. Используйте команду /add\n' +
        '2. Отправьте ссылку на игру в Steam\n' +
        '3. Укажите количество игроков (по умолчанию: 1)\n' +
        '4. Укажите категорию игры\n\n' +
        'Для работы с категориями:\n' +
        '1. /categories - посмотреть все категории и количество игр в них\n' +
        '2. /add_category <название> - создать новую категорию'
      : 'Для использования бота добавьте меня в группу с топиками.\n' +
        'Там вы сможете настроить уведомления о скидках в нужном топике.';

    await ctx.reply(message);
  }

  private async handleCategories(ctx: BotContext): Promise<void> {
    logger.debug('Handling /categories command', { chatId: ctx.chat?.id });
    const processingMsg = await ctx.reply('⏳ Получаю список категорий...');

    try {
      const categories = await this.gameService.getCategoriesWithGameCount();

      if (categories.length === 0) {
        await ctx.reply('📝 Список категорий пуст');
        return;
      }

      const message = categories
        .map((cat: { name: string; gamesCount: number }) => `📁 ${cat.name}: ${cat.gamesCount} игр`)
        .join('\n');

      logger.info('Categories list retrieved successfully', {
        chatId: ctx.chat?.id,
        categoriesCount: categories.length,
      });

      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply(`📊 Категории:\n\n${message}`);
    } catch (error) {
      logger.error('Error getting categories list', {
        chatId: ctx.chat?.id,
        error,
      });
      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply('❌ Произошла ошибка при получении списка категорий');
    }
  }

  private async handleAddCategory(ctx: BotContext): Promise<void> {
    logger.debug('Handling /add_category command', { chatId: ctx.chat?.id });

    const categoryName = ctx.match;
    if (!categoryName) {
      await ctx.reply('Пожалуйста, используйте формат: /add_category <название категории>');
      return;
    }

    const processingMsg = await ctx.reply('⏳ Добавляю категорию...');

    try {
      const category = await this.gameService.createCategory(categoryName.toString());

      logger.info('Category added successfully', {
        chatId: ctx.chat?.id,
        categoryName: category.name,
      });

      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply(`✅ Категория "${category.name}" успешно добавлена!`);
    } catch (error) {
      logger.error('Error adding category', {
        chatId: ctx.chat?.id,
        categoryName,
        error,
      });
      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply('❌ Произошла ошибка при добавлении категории');
    }
  }

  public start(): void {
    this.bot.start();
  }
}

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
  awaitingGameUrl?: boolean;
  userId?: number;
  step?: 'url' | 'players' | 'category' | null;
  messageIdsToDelete?: number[];
}

type BotContext = Context & SessionFlavor<SessionData>;

export class GameBot {
  private bot: Bot<BotContext>;
  private gameService: IGameService;
  private notificationService: NotificationService;

  private async deleteMessages(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.session.messageIdsToDelete?.length) return;

    for (const messageId of ctx.session.messageIdsToDelete) {
      try {
        await ctx.api.deleteMessage(chatId, messageId);
      } catch (error) {
        logger.warn('Failed to delete message', { messageId, error });
      }
    }
    ctx.session.messageIdsToDelete = [];
  }

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
          awaitingGameUrl: false,
          userId: undefined,
          step: null,
          messageIdsToDelete: [],
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
      const userId = ctx.from.id;

      if (
        !chatId ||
        !ctx.session.gameUrl ||
        !ctx.session.awaitingCategories ||
        ctx.session.step !== 'category' ||
        ctx.session.userId !== userId
      ) {
        await ctx.answerCallbackQuery({
          text: '❌ Ошибка: сессия выбора категории не активна',
          show_alert: true,
        });
        return;
      }

      // Удаляем предыдущие сообщения
      await this.deleteMessages(ctx);

      const processingMsg = await ctx.reply('⏳ Добавляю игру...');
      ctx.session.messageIdsToDelete = [processingMsg.message_id];

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

        // Удаляем все сообщения из сессии
        await this.deleteMessages(ctx);

        await ctx.answerCallbackQuery({
          text: '✅ Категория выбрана',
        });

        await ctx.reply('✅ Игра успешно добавлена!');

        // Очищаем сессию
        ctx.session.gameUrl = undefined;
        ctx.session.category = undefined;
        ctx.session.awaitingCategories = false;
        ctx.session.players = undefined;
        ctx.session.awaitingPlayers = false;
        ctx.session.awaitingGameUrl = false;
        ctx.session.userId = undefined;
        ctx.session.step = null;
        ctx.session.messageIdsToDelete = [];
      } catch (error) {
        logger.error('Error adding game with category', {
          chatId,
          category,
          error,
        });

        // Удаляем все сообщения из сессии
        await this.deleteMessages(ctx);

        await ctx.answerCallbackQuery({
          text: '❌ Произошла ошибка при добавлении игры',
          show_alert: true,
        });

        await ctx.reply('❌ Произошла ошибка при добавлении игры');

        // Очищаем сессию
        ctx.session.gameUrl = undefined;
        ctx.session.category = undefined;
        ctx.session.awaitingCategories = false;
        ctx.session.players = undefined;
        ctx.session.awaitingPlayers = false;
        ctx.session.awaitingGameUrl = false;
        ctx.session.userId = undefined;
        ctx.session.step = null;
        ctx.session.messageIdsToDelete = [];
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

    await ctx.reply(message, {
      message_thread_id: ctx.message?.message_thread_id,
    });
  }

  private async handleAdd(ctx: BotContext): Promise<void> {
    logger.debug('Handling /add command', { chatId: ctx.chat?.id });

    if (!ctx.from?.id) {
      await ctx.reply('❌ Не удалось определить пользователя', {
        message_thread_id: ctx.message?.message_thread_id,
      });
      return;
    }

    // Инициализируем массив для хранения ID сообщений
    ctx.session.messageIdsToDelete = [];

    // Сохраняем ID команды /add
    if (ctx.message?.message_id) {
      ctx.session.messageIdsToDelete.push(ctx.message.message_id);
    }

    // Инициализируем сессию для пошагового добавления
    ctx.session.userId = ctx.from.id;
    ctx.session.step = 'url';
    ctx.session.awaitingGameUrl = true;

    // Очищаем предыдущие данные
    ctx.session.gameUrl = undefined;
    ctx.session.category = undefined;
    ctx.session.players = undefined;
    ctx.session.awaitingCategories = false;
    ctx.session.awaitingPlayers = false;

    const message = await ctx.reply('Пожалуйста, отправьте ссылку на игру в Steam', {
      message_thread_id: ctx.message?.message_thread_id,
    });

    // Сохраняем ID сообщения бота
    ctx.session.messageIdsToDelete = [message.message_id];
    if (ctx.message?.message_id) {
      ctx.session.messageIdsToDelete.push(ctx.message.message_id);
    }
  }

  private async handleMessage(ctx: BotContext): Promise<void> {
    const text = ctx.message?.text;
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const threadId = ctx.message?.message_thread_id;

    if (!text || !chatId || !userId) {
      logger.warn('Received message without text, chatId or userId');
      return;
    }

    // Сохраняем ID сообщения пользователя
    if (ctx.message?.message_id) {
      ctx.session.messageIdsToDelete = ctx.session.messageIdsToDelete || [];
      ctx.session.messageIdsToDelete.push(ctx.message.message_id);
    }

    logger.debug('Processing message', { chatId, text: text.substring(0, 50) });

    // Проверяем, что сообщение от того же пользователя, который начал процесс
    if (ctx.session.userId && ctx.session.userId !== userId) {
      return;
    }

    // Обработка URL
    if (ctx.session.step === 'url' && ctx.session.awaitingGameUrl) {
      if (!text.includes('store.steampowered.com')) {
        // Удаляем предыдущие сообщения
        await this.deleteMessages(ctx);

        const errorMsg = await ctx.reply(
          'Пожалуйста, предоставьте корректную ссылку на игру в Steam',
          {
            message_thread_id: threadId,
          }
        );
        ctx.session.messageIdsToDelete = [errorMsg.message_id];
        if (ctx.message?.message_id) {
          ctx.session.messageIdsToDelete.push(ctx.message.message_id);
        }
        return;
      }

      const processingMsg = await ctx.reply('⏳ Обрабатываю ссылку...', {
        message_thread_id: threadId,
      });
      ctx.session.messageIdsToDelete?.push(processingMsg.message_id);

      try {
        const parsedGame = await this.gameService.parser.parseGame(text);

        if (!parsedGame.title) {
          logger.warn('Failed to parse game title', { chatId, url: text });
          // Удаляем предыдущие сообщения
          await this.deleteMessages(ctx);

          const errorMsg = await ctx.reply(
            '❌ Не удалось получить информацию об игре. Проверьте ссылку и попробуйте снова.',
            { message_thread_id: threadId }
          );
          ctx.session.messageIdsToDelete = [errorMsg.message_id];
          if (ctx.message?.message_id) {
            ctx.session.messageIdsToDelete.push(ctx.message.message_id);
          }
          return;
        }

        // Удаляем предыдущие сообщения
        await this.deleteMessages(ctx);

        ctx.session.gameUrl = text;
        ctx.session.awaitingGameUrl = false;
        ctx.session.step = 'players';
        ctx.session.awaitingPlayers = true;

        logger.info('Successfully parsed game', {
          chatId,
          url: text,
          title: parsedGame.title,
        });

        const message = await ctx.reply(
          `✅ Игра найдена: ${parsedGame.title}\n` + 'Укажите количество игроков (по умолчанию: 1)',
          { message_thread_id: threadId }
        );
        ctx.session.messageIdsToDelete = [message.message_id];
        if (ctx.message?.message_id) {
          ctx.session.messageIdsToDelete.push(ctx.message.message_id);
        }
        return;
      } catch (error) {
        logger.error('Error processing Steam URL', { chatId, url: text, error });
        // Удаляем предыдущие сообщения
        await this.deleteMessages(ctx);

        const errorMsg = await ctx.reply(
          '❌ Произошла ошибка при обработке ссылки. Попробуйте позже.',
          {
            message_thread_id: threadId,
          }
        );
        ctx.session.messageIdsToDelete = [errorMsg.message_id];
        if (ctx.message?.message_id) {
          ctx.session.messageIdsToDelete.push(ctx.message.message_id);
        }
        return;
      }
    }

    // Обработка количества игроков
    if (ctx.session.step === 'players' && ctx.session.awaitingPlayers) {
      const players = parseInt(text);
      if (isNaN(players) || players < 1) {
        // Удаляем предыдущие сообщения
        await this.deleteMessages(ctx);

        const errorMsg = await ctx.reply(
          'Пожалуйста, укажите корректное количество игроков (целое число больше 0)',
          {
            message_thread_id: threadId,
          }
        );
        ctx.session.messageIdsToDelete = [errorMsg.message_id];
        if (ctx.message?.message_id) {
          ctx.session.messageIdsToDelete.push(ctx.message.message_id);
        }
        return;
      }

      // Удаляем предыдущие сообщения
      await this.deleteMessages(ctx);

      ctx.session.players = players;
      ctx.session.awaitingPlayers = false;
      ctx.session.step = 'category';
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

        const message = await ctx.reply('Выберите категорию игры:', {
          reply_markup: keyboard,
          message_thread_id: threadId,
        });
        ctx.session.messageIdsToDelete = [message.message_id];
        if (ctx.message?.message_id) {
          ctx.session.messageIdsToDelete.push(ctx.message.message_id);
        }
      } catch (error) {
        logger.error('Error getting categories', { error });
        const errorMsg = await ctx.reply('Произошла ошибка при получении списка категорий', {
          message_thread_id: threadId,
        });
        ctx.session.messageIdsToDelete = [errorMsg.message_id];
        if (ctx.message?.message_id) {
          ctx.session.messageIdsToDelete.push(ctx.message.message_id);
        }
      }
      return;
    }
  }

  private async handleList(ctx: BotContext): Promise<void> {
    try {
      const games = await this.gameService.getGames();
      if (games.length === 0) {
        await ctx.reply('Список игр пуст', {
          message_thread_id: ctx.message?.message_thread_id,
        });
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
          const header = `\\-\\-\\-\\-\\-\\- *${category}* \\-\\-\\-\\-\\-\\-\n\n`;
          const gamesList = categoryGames
            .map(game => {
              const escapedTitle = game.title.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
              const name = `[${escapedTitle}](${game.url})`;
              const price = `${game.basePrice > game.currentPrice ? `~${game.basePrice}~ ` : ''}${game.currentPrice} руб\\.`;
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
        message_thread_id: ctx.message?.message_thread_id,
      });
    } catch (error) {
      logger.error('Error getting game list', { error });
      await ctx.reply('Произошла ошибка при получении списка игр', {
        message_thread_id: ctx.message?.message_thread_id,
      });
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
      await ctx.reply('Цены успешно обновлены! Используйте /list чтобы увидеть актуальные цены.', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    } catch (error) {
      await ctx.reply('Произошла ошибка при обновлении цен', {
        message_thread_id: ctx.message?.message_thread_id,
      });
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

    await ctx.reply(message, {
      message_thread_id: ctx.message?.message_thread_id,
    });
  }

  private async handleCategories(ctx: BotContext): Promise<void> {
    logger.debug('Handling /categories command', { chatId: ctx.chat?.id });
    const processingMsg = await ctx.reply('⏳ Получаю список категорий...', {
      message_thread_id: ctx.message?.message_thread_id,
    });

    try {
      const categories = await this.gameService.getCategoriesWithGameCount();

      if (categories.length === 0) {
        await ctx.reply('📝 Список категорий пуст', {
          message_thread_id: ctx.message?.message_thread_id,
        });
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
      await ctx.reply(`📊 Категории:\n\n${message}`, {
        message_thread_id: ctx.message?.message_thread_id,
      });
    } catch (error) {
      logger.error('Error getting categories list', {
        chatId: ctx.chat?.id,
        error,
      });
      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply('❌ Произошла ошибка при получении списка категорий', {
        message_thread_id: ctx.message?.message_thread_id,
      });
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

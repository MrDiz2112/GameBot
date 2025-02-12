import { Bot, Context, session, SessionFlavor } from 'grammy';
import { IGameService, IGame } from '../types';
import { NotificationService } from '../services/NotificationService';
import logger from '../utils/logger';

interface SessionData {
  gameUrl?: string;
  categories?: string[];
  awaitingCategories?: boolean;
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
          categories: undefined,
          awaitingCategories: false,
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

    // Handle URL input after /add command
    this.bot.on('message:text', this.handleMessage.bind(this));

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
    ctx.session.gameUrl = undefined;
    ctx.session.categories = undefined;
    ctx.session.awaitingCategories = false;
    await ctx.reply('Пожалуйста, отправьте ссылку на игру в Steam');
  }

  private async handleMessage(ctx: BotContext): Promise<void> {
    const text = ctx.message?.text;
    const chatId = ctx.chat?.id;

    if (!text || !chatId) {
      logger.warn('Received message without text or chatId');
      return;
    }

    logger.debug('Processing message', { chatId, text: text.substring(0, 50) });

    if (!ctx.session.gameUrl && text.includes('store.steampowered.com')) {
      logger.info('Received Steam URL', { chatId, url: text });
      const processingMsg = await ctx.reply('⏳ Обрабатываю ссылку...');

      try {
        const parsedGame = await this.gameService.parser.parseGame(text);

        if (!parsedGame.title) {
          logger.warn('Failed to parse game title', { chatId, url: text });
          await ctx.reply(
            '❌ Не удалось получить информацию об игре. Проверьте ссылку и попробуйте снова.'
          );
          await ctx.api.deleteMessage(chatId, processingMsg.message_id);
          return;
        }

        ctx.session.gameUrl = text;
        ctx.session.awaitingCategories = true;
        logger.info('Successfully parsed game', {
          chatId,
          url: text,
          title: parsedGame.title,
        });

        await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        await ctx.reply(
          `✅ Игра найдена: ${parsedGame.title}\n` +
            'Теперь укажите категории игры через запятую (например: Action, RPG, Multiplayer)'
        );
      } catch (error) {
        logger.error('Error processing Steam URL', { chatId, url: text, error });
        await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        await ctx.reply('❌ Произошла ошибка при обработке ссылки. Попробуйте позже.');
      }
      return;
    }

    if (ctx.session.gameUrl && ctx.session.awaitingCategories) {
      logger.info('Processing categories', { chatId, categories: text });
      const processingMsg = await ctx.reply('⏳ Добавляю игру...');

      try {
        const categories = text.split(',').map(c => c.trim());
        const game: IGame = {
          url: ctx.session.gameUrl,
          platform: 'steam',
          categories,
          basePrice: 0,
          currentPrice: 0,
          title: '', // Will be parsed
        };

        await this.gameService.addGame(game);
        logger.info('Game successfully added', {
          chatId,
          url: ctx.session.gameUrl,
          categories,
        });

        await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        await ctx.reply('✅ Игра успешно добавлена!');
      } catch (error) {
        logger.error('Error adding game', {
          chatId,
          url: ctx.session.gameUrl,
          categories: text,
          error,
        });
        await ctx.api.deleteMessage(chatId, processingMsg.message_id);
        await ctx.reply('❌ Произошла ошибка при добавлении игры. Попробуйте еще раз.');
      }

      ctx.session.gameUrl = undefined;
      ctx.session.categories = undefined;
      ctx.session.awaitingCategories = false;
    }
  }

  private async handleList(ctx: BotContext): Promise<void> {
    try {
      const games = await this.gameService.getGames();
      if (games.length === 0) {
        await ctx.reply('Список игр пуст');
        return;
      }

      const message = games
        .map(game => {
          return (
            `🎮 [${game.title}](${game.url})\n` +
            `💰 Цена: ${game.basePrice > game.currentPrice ? `~${game.basePrice}~ ` : ''}${game.currentPrice || 'Н/Д'} руб\\.\n` +
            `🏷 Категории: ${(game.categories?.join(', ') || 'Н/Д').replace(/[.-]/g, '\\$&')}\n`
          );
        })
        .join('\n\n');

      await ctx.reply(message, { parse_mode: 'MarkdownV2' });
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
        '/set_notifications - Настроить уведомления о скидках в текущем топике\n' +
        '/remove_notifications - Отключить уведомления в текущем топике\n' +
        '/help - Показать это сообщение\n\n' +
        'Для добавления игры:\n' +
        '1. Используйте команду /add\n' +
        '2. Отправьте ссылку на игру в Steam\n' +
        '3. Укажите категории игры через запятую'
      : 'Для использования бота добавьте меня в группу с топиками.\n' +
        'Там вы сможете настроить уведомления о скидках в нужном топике.';

    await ctx.reply(message);
  }

  public start(): void {
    this.bot.start();
  }
}

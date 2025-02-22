import { Bot, Context, session, SessionFlavor } from 'grammy';
import { IGameService } from '../types';
import { NotificationService } from '../services/NotificationService';
import { CommandHandlers } from './handlers/CommandHandlers';
import { MessageHandlers } from './handlers/MessageHandlers';
import { MessageHelper } from './helpers/MessageHelper';
import { SessionData } from './types/SessionData';
import logger from '../utils/logger';

type BotContext = Context & SessionFlavor<SessionData>;

export class GameBot {
  private bot: Bot<BotContext>;
  private commandHandlers: CommandHandlers;
  private messageHandlers: MessageHandlers;
  private messageHelper: MessageHelper;

  constructor(token: string, gameService: IGameService) {
    this.bot = new Bot<BotContext>(token);
    this.messageHelper = new MessageHelper();
    const notificationService = new NotificationService(this.bot, gameService);
    this.commandHandlers = new CommandHandlers(
      gameService,
      notificationService,
      this.messageHelper
    );
    this.messageHandlers = new MessageHandlers(gameService, this.messageHelper);

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
    this.setupPriceChecking(notificationService);
    logger.info('GameBot initialized');
  }

  private setupCommands(): void {
    this.bot.command('start', ctx => this.commandHandlers.handleStart(ctx));
    this.bot.command('add', ctx => this.commandHandlers.handleAdd(ctx));
    this.bot.command('list', ctx => this.commandHandlers.handleList(ctx));
    this.bot.command('check_prices', ctx => this.commandHandlers.handleCheckPrices(ctx));
    this.bot.command('help', ctx => this.commandHandlers.handleHelp(ctx));
    this.bot.command('set_notifications', ctx => this.commandHandlers.handleSetNotifications(ctx));
    this.bot.command('remove_notifications', ctx =>
      this.commandHandlers.handleRemoveNotifications(ctx)
    );
    this.bot.command('categories', ctx => this.commandHandlers.handleCategories(ctx));

    // Handle URL input after /add command
    this.bot.on('message:text', ctx => this.messageHandlers.handleMessage(ctx));

    // Handle category selection
    this.bot.callbackQuery(/^category:(.+)$/, ctx =>
      this.messageHandlers.handleCategorySelection(ctx)
    );

    this.bot.api.setMyCommands([
      { command: 'start', description: 'Начать работу с ботом' },
      { command: 'add', description: 'Добавить новую игру' },
      { command: 'list', description: 'Показать список игр' },
      { command: 'check_prices', description: 'Проверить цены' },
      { command: 'categories', description: 'Показать список категорий и количество игр в них' },
      { command: 'add_category', description: 'Добавить новую категорию' },
      {
        command: 'set_notifications',
        description: 'Настроить уведомления о скидках в текущем топике',
      },
      { command: 'remove_notifications', description: 'Отключить уведомления в текущем топике' },
      { command: 'help', description: 'Показать помощь' },
    ]);
  }

  private setupPriceChecking(notificationService: NotificationService): void {
    setInterval(
      () => {
        notificationService.checkPricesAndNotify().catch(error => {
          logger.error('Failed to check prices:', error);
        });
      },
      24 * 60 * 60 * 1000
    );
  }

  public start(): void {
    this.bot.start();
  }
}

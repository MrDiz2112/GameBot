import { Bot, Context, session, SessionFlavor } from 'grammy';
import { IGameService } from '../types';
import { NotificationService } from '../services/NotificationService';
import { MessageHandlers } from './handlers/MessageHandlers';
import { MessageHelper } from './helpers/MessageHelper';
import { SessionData } from './types/SessionData';
import { BasicCommandHandler } from './handlers/BasicCommandHandler';
import { GameCommandHandler } from './handlers/GameCommandHandler';
import { NotificationHandler } from './handlers/NotificationHandler';
import { PartyCommandHandler } from './handlers/PartyCommandHandler';
import logger from '../utils/logger';

type BotContext = Context & SessionFlavor<SessionData>;

export class GameBot {
  private bot: Bot<BotContext>;
  private messageHandlers: MessageHandlers;
  private basicCommandHandler: BasicCommandHandler;
  private gameCommandHandler: GameCommandHandler;
  private notificationHandler: NotificationHandler;
  private partyCommandHandler: PartyCommandHandler;
  private messageHelper: MessageHelper;

  constructor(token: string, gameService: IGameService) {
    this.bot = new Bot<BotContext>(token);
    this.messageHelper = new MessageHelper();
    const notificationService = new NotificationService(this.bot, gameService);

    // Initialize handlers
    this.basicCommandHandler = new BasicCommandHandler(gameService, this.messageHelper);
    this.gameCommandHandler = new GameCommandHandler(gameService, this.messageHelper);
    this.notificationHandler = new NotificationHandler(
      gameService,
      this.messageHelper,
      notificationService
    );
    this.partyCommandHandler = new PartyCommandHandler(gameService, this.messageHelper);
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
          partyState: undefined,
        }),
      })
    );

    this.setupCommands();
    this.setupPriceChecking(notificationService);
    logger.info('GameBot initialized');
  }

  private setupCommands(): void {
    // Basic commands
    this.bot.command('start', ctx => this.basicCommandHandler.handleStart(ctx));
    this.bot.command('help', ctx => this.basicCommandHandler.handleHelp(ctx));

    // Game commands
    this.bot.command('add', ctx => this.gameCommandHandler.handleAdd(ctx));
    this.bot.command('list', ctx => this.gameCommandHandler.handleList(ctx));
    this.bot.command('check_prices', ctx => this.gameCommandHandler.handleCheckPrices(ctx));
    this.bot.command('categories', ctx => this.gameCommandHandler.handleCategories(ctx));
    this.bot.command('delete', ctx => this.gameCommandHandler.handleDelete(ctx));
    this.bot.command('edit_category', ctx => this.gameCommandHandler.handleEditCategory(ctx));
    this.bot.command('add_category', ctx => this.gameCommandHandler.handleAddCategory(ctx));
    this.bot.command('edit_players', ctx => this.gameCommandHandler.handleEditPlayers(ctx));
    this.bot.command('play', ctx => this.gameCommandHandler.handleSearchByPlayers(ctx));

    // Party commands
    this.bot.command('create_party', ctx => this.partyCommandHandler.handleCreateParty(ctx));
    this.bot.command('party', ctx => this.partyCommandHandler.handleParty(ctx));

    // Notification commands
    this.bot.command('set_notifications', ctx =>
      this.notificationHandler.handleSetNotifications(ctx)
    );
    this.bot.command('remove_notifications', ctx =>
      this.notificationHandler.handleRemoveNotifications(ctx)
    );

    // Message handlers
    this.bot.on('message:text', ctx => {
      if (ctx.session.partyState) {
        return this.partyCommandHandler.handlePartyMessage(ctx);
      }
      return this.messageHandlers.handleMessage(ctx);
    });

    this.bot.callbackQuery(/^category:(.+)$/, ctx =>
      this.messageHandlers.handleCategorySelection(ctx)
    );
    this.bot.callbackQuery(/^delete:(\d+)$/, ctx => this.messageHandlers.handleDeleteGame(ctx));
    this.bot.callbackQuery(/^edit_category:(\d+)$/, ctx =>
      this.messageHandlers.handleEditCategorySelection(ctx)
    );
    this.bot.callbackQuery(/^edit_players:(\d+)$/, ctx =>
      this.messageHandlers.handleEditPlayers(ctx)
    );
    this.bot.callbackQuery(/^party:(\d+):(\d+):(\d+)$/, ctx =>
      this.partyCommandHandler.handlePartySelection(ctx)
    );

    this.bot.api.setMyCommands([
      // { command: 'start', description: 'Начать работу с ботом' },
      { command: 'add', description: 'Добавить новую игру' },
      { command: 'list', description: 'Показать список игр' },
      // { command: 'check_prices', description: 'Проверить цены' },
      // { command: 'categories', description: 'Показать список категорий и количество игр в них' },
      // { command: 'add_category', description: 'Добавить новую категорию' },
      // { command: 'edit_category', description: 'Изменить категорию игры' },
      // { command: 'edit_players', description: 'Изменить количество игроков' },
      { command: 'play', description: 'Найти игры по количеству игроков' },
      // { command: 'delete', description: 'Удалить игру из списка' },
      // { command: 'create_party', description: 'Создать новую группу пользователей' },
      { command: 'party', description: 'Позвать группу пользователей' },
      // {
      //   command: 'set_notifications',
      //   description: 'Настроить уведомления о скидках в текущем топике',
      // },
      // { command: 'remove_notifications', description: 'Отключить уведомления в текущем топике' },
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

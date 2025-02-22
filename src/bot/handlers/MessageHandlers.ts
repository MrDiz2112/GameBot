import { Context, InlineKeyboard } from 'grammy';
import { SessionFlavor } from 'grammy';
import { IGameService, IGame } from '../../types';
import { SessionData } from '../types/SessionData';
import { MessageHelper } from '../helpers/MessageHelper';
import logger from '../../utils/logger';

type BotContext = Context & SessionFlavor<SessionData>;

export class MessageHandlers {
  constructor(
    private gameService: IGameService,
    private messageHelper: MessageHelper
  ) {}

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

  async handleMessage(ctx: BotContext): Promise<void> {
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

    if (ctx.session.step === 'url' && ctx.session.awaitingGameUrl) {
      await this.handleUrlStep(ctx, text, threadId);
    } else if (ctx.session.step === 'players' && ctx.session.awaitingPlayers) {
      await this.handlePlayersStep(ctx, text, threadId);
    }
  }

  private async handleUrlStep(ctx: BotContext, text: string, threadId?: number): Promise<void> {
    if (!text.includes('store.steampowered.com')) {
      await this.deleteMessages(ctx);
      const errorMsg = await ctx.reply(
        'Пожалуйста, предоставьте корректную ссылку на игру в Steam',
        {
          message_thread_id: threadId,
        }
      );
      this.updateMessageIds(ctx, errorMsg.message_id);
      return;
    }

    const processingMsg = await ctx.reply('⏳ Обрабатываю ссылку...', {
      message_thread_id: threadId,
    });
    ctx.session.messageIdsToDelete?.push(processingMsg.message_id);

    try {
      const parsedGame = await this.gameService.parser.parseGame(text);
      if (!parsedGame.title) {
        await this.handleParseError(ctx, threadId);
        return;
      }

      await this.handleSuccessfulParse(ctx, text, parsedGame.title, threadId);
    } catch (error) {
      await this.handleParseError(ctx, threadId);
    }
  }

  private async handlePlayersStep(ctx: BotContext, text: string, threadId?: number): Promise<void> {
    const players = parseInt(text);
    if (isNaN(players) || players < 1) {
      await this.deleteMessages(ctx);
      const errorMsg = await ctx.reply(
        'Пожалуйста, укажите корректное количество игроков (целое число больше 0)',
        { message_thread_id: threadId }
      );
      this.updateMessageIds(ctx, errorMsg.message_id);
      return;
    }

    await this.deleteMessages(ctx);
    await this.setupCategorySelection(ctx, players, threadId);
  }

  private async handleParseError(ctx: BotContext, threadId?: number): Promise<void> {
    await this.deleteMessages(ctx);
    const errorMsg = await ctx.reply(
      '❌ Не удалось получить информацию об игре. Проверьте ссылку и попробуйте снова.',
      {
        message_thread_id: threadId,
      }
    );
    this.updateMessageIds(ctx, errorMsg.message_id);
  }

  private async handleSuccessfulParse(
    ctx: BotContext,
    url: string,
    title: string,
    threadId?: number
  ): Promise<void> {
    await this.deleteMessages(ctx);
    ctx.session.gameUrl = url;
    ctx.session.awaitingGameUrl = false;
    ctx.session.step = 'players';
    ctx.session.awaitingPlayers = true;

    const message = await ctx.reply(
      `✅ Игра найдена: ${title}\n` + 'Укажите количество игроков (по умолчанию: 1)',
      { message_thread_id: threadId }
    );
    this.updateMessageIds(ctx, message.message_id);
  }

  private async setupCategorySelection(
    ctx: BotContext,
    players: number,
    threadId?: number
  ): Promise<void> {
    ctx.session.players = players;
    ctx.session.awaitingPlayers = false;
    ctx.session.step = 'category';
    ctx.session.awaitingCategories = true;

    try {
      const categories = await this.gameService.getCategories();
      const keyboard = this.createCategoryKeyboard(categories);
      const message = await ctx.reply('Выберите категорию игры:', {
        reply_markup: keyboard,
        message_thread_id: threadId,
      });
      this.updateMessageIds(ctx, message.message_id);
    } catch (error) {
      logger.error('Error getting categories', { error });
      const errorMsg = await ctx.reply('Произошла ошибка при получении списка категорий', {
        message_thread_id: threadId,
      });
      this.updateMessageIds(ctx, errorMsg.message_id);
    }
  }

  async handleCategorySelection(ctx: BotContext): Promise<void> {
    if (!ctx.match?.[1]) return;

    const category = ctx.match[1];
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const threadId = ctx.callbackQuery?.message?.message_thread_id;

    if (!userId) {
      await ctx.answerCallbackQuery({
        text: '❌ Ошибка: не удалось определить пользователя',
        show_alert: true,
      });
      return;
    }

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

    await this.deleteMessages(ctx);
    const processingMsg = await ctx.reply('⏳ Добавляю игру...', {
      message_thread_id: threadId,
    });
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
      await this.handleSuccessfulGameAdd(ctx, threadId);
    } catch (error) {
      await this.handleGameAddError(ctx, category, chatId, threadId);
    }
  }

  async handleDeleteGame(ctx: BotContext): Promise<void> {
    if (!ctx.match?.[1] || !ctx.callbackQuery) return;

    const gameId = parseInt(ctx.match[1]);
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const threadId = ctx.callbackQuery.message?.message_thread_id;

    if (!userId || !chatId) {
      await ctx.answerCallbackQuery({
        text: '❌ Ошибка: не удалось определить пользователя или чат',
        show_alert: true,
      });
      return;
    }

    try {
      await this.gameService.removeGame(gameId);
      await ctx.answerCallbackQuery({
        text: '✅ Игра успешно удалена',
        show_alert: true,
      });

      if (ctx.callbackQuery.message) {
        await ctx.api.deleteMessage(chatId, ctx.callbackQuery.message.message_id);
      }

      await ctx.reply('✅ Игра успешно удалена из списка', {
        message_thread_id: threadId,
      });
    } catch (error) {
      logger.error('Error deleting game', { gameId, error });
      await ctx.answerCallbackQuery({
        text: '❌ Произошла ошибка при удалении игры',
        show_alert: true,
      });
      await ctx.reply('❌ Произошла ошибка при удалении игры', {
        message_thread_id: threadId,
      });
    }
  }

  private async handleSuccessfulGameAdd(ctx: BotContext, threadId?: number): Promise<void> {
    await this.deleteMessages(ctx);
    await ctx.answerCallbackQuery({
      text: '✅ Категория выбрана',
    });
    await ctx.reply('✅ Игра успешно добавлена!', {
      message_thread_id: threadId,
    });
    this.clearSession(ctx);
  }

  private async handleGameAddError(
    ctx: BotContext,
    category: string,
    chatId: number,
    threadId?: number
  ): Promise<void> {
    logger.error('Error adding game with category', {
      chatId,
      category,
    });

    await this.deleteMessages(ctx);
    await ctx.answerCallbackQuery({
      text: '❌ Произошла ошибка при добавлении игры',
      show_alert: true,
    });
    await ctx.reply('❌ Произошла ошибка при добавлении игры', {
      message_thread_id: threadId,
    });
    this.clearSession(ctx);
  }

  private createCategoryKeyboard(categories: string[]): InlineKeyboard {
    const keyboard = new InlineKeyboard();
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
    return keyboard;
  }

  private updateMessageIds(ctx: BotContext, messageId: number): void {
    ctx.session.messageIdsToDelete = [messageId];
    if (ctx.message?.message_id) {
      ctx.session.messageIdsToDelete.push(ctx.message.message_id);
    }
  }

  private clearSession(ctx: BotContext): void {
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
}

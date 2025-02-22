import { Context } from 'grammy';
import { SessionFlavor } from 'grammy';
import { IGameService } from '../../types';
import { NotificationService } from '../../services/NotificationService';
import logger from '../../utils/logger';
import { SessionData } from '../types/SessionData';
import { MessageHelper } from '../helpers/MessageHelper';

type BotContext = Context & SessionFlavor<SessionData>;

export class CommandHandlers {
  constructor(
    private gameService: IGameService,
    private notificationService: NotificationService,
    private messageHelper: MessageHelper
  ) {}

  async handleStart(ctx: BotContext): Promise<void> {
    const isGroup = ctx.chat?.type === 'supergroup';
    const message = this.messageHelper.getStartMessage(isGroup);
    await ctx.reply(message, {
      message_thread_id: ctx.message?.message_thread_id,
    });
  }

  async handleAdd(ctx: BotContext): Promise<void> {
    logger.debug('Handling /add command', { chatId: ctx.chat?.id });

    if (!ctx.from?.id) {
      await ctx.reply('❌ Не удалось определить пользователя', {
        message_thread_id: ctx.message?.message_thread_id,
      });
      return;
    }

    ctx.session = this.messageHelper.initializeAddSession(ctx);
    const message = await ctx.reply('Пожалуйста, отправьте ссылку на игру в Steam', {
      message_thread_id: ctx.message?.message_thread_id,
    });

    ctx.session.messageIdsToDelete = [message.message_id];
    if (ctx.message?.message_id) {
      ctx.session.messageIdsToDelete.push(ctx.message.message_id);
    }
  }

  async handleList(ctx: BotContext): Promise<void> {
    try {
      const games = await this.gameService.getGames();
      const message = this.messageHelper.formatGamesList(games);
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

  async handleCheckPrices(ctx: BotContext): Promise<void> {
    try {
      const games = await this.gameService.getGames();
      for (const game of games) {
        if (game.id) {
          await this.gameService.updatePrice(game.id);
        }
      }
      await ctx.reply('Цены успешно обновлены! Используйте /list чтобы увидеть актуальные цены.', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    } catch (error) {
      logger.error('Error updating prices', { error });
      await ctx.reply('Произошла ошибка при обновлении цен', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  }

  async handleSetNotifications(ctx: BotContext): Promise<void> {
    const { chatId, threadId, error } = this.messageHelper.validateNotificationContext(ctx);
    if (error) {
      await ctx.reply(error);
      return;
    }

    if (!chatId || !threadId) {
      await ctx.reply('Ошибка: не удалось определить параметры чата.');
      return;
    }

    try {
      await this.notificationService.setNotificationThread(chatId, threadId);
      await ctx.reply('Уведомления о скидках будут приходить в этот топик!');
    } catch (error) {
      await ctx.reply('Произошла ошибка при настройке уведомлений.');
    }
  }

  async handleRemoveNotifications(ctx: BotContext): Promise<void> {
    const { chatId, threadId, error } = this.messageHelper.validateNotificationContext(ctx);
    if (error) {
      await ctx.reply(error);
      return;
    }

    if (!chatId || !threadId) {
      await ctx.reply('Ошибка: не удалось определить параметры чата.');
      return;
    }

    try {
      await this.notificationService.removeNotificationSettings(chatId, threadId);
      await ctx.reply('Уведомления о скидках отключены для этого топика.');
    } catch (error) {
      await ctx.reply('Произошла ошибка при отключении уведомлений.');
    }
  }

  async handleHelp(ctx: BotContext): Promise<void> {
    const isGroup = ctx.chat?.type === 'supergroup';
    const message = this.messageHelper.getHelpMessage(isGroup);
    await ctx.reply(message, {
      message_thread_id: ctx.message?.message_thread_id,
    });
  }

  async handleCategories(ctx: BotContext): Promise<void> {
    logger.debug('Handling /categories command', { chatId: ctx.chat?.id });
    const processingMsg = await ctx.reply('⏳ Получаю список категорий...', {
      message_thread_id: ctx.message?.message_thread_id,
    });

    try {
      const categories = await this.gameService.getCategoriesWithGameCount();
      const message = this.messageHelper.formatCategoriesList(categories);

      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply(message, {
        message_thread_id: ctx.message?.message_thread_id,
      });
    } catch (error) {
      logger.error('Error getting categories list', { chatId: ctx.chat?.id, error });
      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply('❌ Произошла ошибка при получении списка категорий', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  }
}

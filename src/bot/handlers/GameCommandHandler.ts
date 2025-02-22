import { BaseHandler, BotContext } from './BaseHandler';
import logger from '../../utils/logger';

export class GameCommandHandler extends BaseHandler {
  async handleAdd(ctx: BotContext): Promise<void> {
    logger.debug('Handling /add command', { chatId: ctx.chat?.id });

    if (!(await this.validateUser(ctx))) {
      return;
    }

    ctx.session = this.messageHelper.initializeAddSession(ctx);
    const message = await ctx.reply('Пожалуйста, отправьте ссылку на игру в Steam', {
      message_thread_id: this.getThreadId(ctx),
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
        message_thread_id: this.getThreadId(ctx),
      });
    } catch (error) {
      logger.error('Error getting game list', { error });
      await ctx.reply('Произошла ошибка при получении списка игр', {
        message_thread_id: this.getThreadId(ctx),
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
        message_thread_id: this.getThreadId(ctx),
      });
    } catch (error) {
      logger.error('Error updating prices', { error });
      await ctx.reply('Произошла ошибка при обновлении цен', {
        message_thread_id: this.getThreadId(ctx),
      });
    }
  }

  async handleCategories(ctx: BotContext): Promise<void> {
    logger.debug('Handling /categories command', { chatId: ctx.chat?.id });
    const processingMsg = await ctx.reply('⏳ Получаю список категорий...', {
      message_thread_id: this.getThreadId(ctx),
    });

    try {
      const categories = await this.gameService.getCategoriesWithGameCount();
      const message = this.messageHelper.formatCategoriesList(categories);

      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply(message, {
        message_thread_id: this.getThreadId(ctx),
      });
    } catch (error) {
      logger.error('Error getting categories list', { chatId: ctx.chat?.id, error });
      if (ctx.chat?.id) {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      }
      await ctx.reply('❌ Произошла ошибка при получении списка категорий', {
        message_thread_id: this.getThreadId(ctx),
      });
    }
  }
}

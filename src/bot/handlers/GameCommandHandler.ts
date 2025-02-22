import { BaseHandler, BotContext } from './BaseHandler';
import logger from '../../utils/logger';
import { InlineKeyboard } from 'grammy';

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

  async handleDelete(ctx: BotContext): Promise<void> {
    logger.debug('Handling /delete command', { chatId: ctx.chat?.id });

    if (!(await this.validateUser(ctx))) {
      return;
    }

    try {
      const games = await this.gameService.getGames();
      if (games.length === 0) {
        await ctx.reply('❌ Список игр пуст', {
          message_thread_id: this.getThreadId(ctx),
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      games.forEach(game => {
        keyboard.text(game.title, `delete:${game.id}`).row();
      });

      await ctx.reply('Выберите игру для удаления:', {
        reply_markup: keyboard,
        message_thread_id: this.getThreadId(ctx),
      });
    } catch (error) {
      logger.error('Error getting games for deletion', { error });
      await ctx.reply('❌ Произошла ошибка при получении списка игр', {
        message_thread_id: this.getThreadId(ctx),
      });
    }
  }

  async handleEditCategory(ctx: BotContext): Promise<void> {
    logger.debug('Handling /edit_category command', { chatId: ctx.chat?.id });

    if (!(await this.validateUser(ctx))) {
      return;
    }

    try {
      const games = await this.gameService.getGames();
      if (games.length === 0) {
        await ctx.reply('❌ Список игр пуст', {
          message_thread_id: this.getThreadId(ctx),
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      games.forEach(game => {
        keyboard.text(game.title, `edit_category:${game.id}`).row();
      });

      await ctx.reply('Выберите игру для изменения категории:', {
        reply_markup: keyboard,
        message_thread_id: this.getThreadId(ctx),
      });
    } catch (error) {
      logger.error('Error getting games for category editing', { error });
      await ctx.reply('❌ Произошла ошибка при получении списка игр', {
        message_thread_id: this.getThreadId(ctx),
      });
    }
  }

  async handleAddCategory(ctx: BotContext): Promise<void> {
    logger.debug('Handling /add_category command', { chatId: ctx.chat?.id });

    if (!(await this.validateUser(ctx))) {
      return;
    }

    const categoryName = ctx.message?.text?.split(' ').slice(1).join(' ');
    if (!categoryName) {
      await ctx.reply(
        '❌ Пожалуйста, укажите название категории после команды.\nПример: /add_category Стратегии',
        {
          message_thread_id: this.getThreadId(ctx),
        }
      );
      return;
    }

    try {
      await this.gameService.createCategory(categoryName);
      await ctx.reply(`✅ Категория "${categoryName}" успешно создана!`, {
        message_thread_id: this.getThreadId(ctx),
      });
    } catch (error) {
      logger.error('Error creating category', { categoryName, error });
      await ctx.reply('❌ Произошла ошибка при создании категории', {
        message_thread_id: this.getThreadId(ctx),
      });
    }
  }

  async handleEditPlayers(ctx: BotContext): Promise<void> {
    logger.debug('Handling /edit_players command', { chatId: ctx.chat?.id });

    if (!(await this.validateUser(ctx))) {
      return;
    }

    try {
      const games = await this.gameService.getGames();
      if (games.length === 0) {
        await ctx.reply('❌ Список игр пуст', {
          message_thread_id: this.getThreadId(ctx),
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      games.forEach(game => {
        keyboard.text(game.title, `edit_players:${game.id}`).row();
      });

      const message = await ctx.reply('Выберите игру для изменения количества игроков:', {
        reply_markup: keyboard,
        message_thread_id: this.getThreadId(ctx),
      });

      // Сохраняем ID сообщения для последующего удаления
      ctx.session.messageIdsToDelete = [message.message_id];
      if (ctx.message?.message_id) {
        ctx.session.messageIdsToDelete.push(ctx.message.message_id);
      }
    } catch (error) {
      logger.error('Error getting games for players editing', { error });
      await ctx.reply('❌ Произошла ошибка при получении списка игр', {
        message_thread_id: this.getThreadId(ctx),
      });
    }
  }
}

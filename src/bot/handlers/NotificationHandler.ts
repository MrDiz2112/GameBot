import { BaseHandler, BotContext } from './BaseHandler';

export class NotificationHandler extends BaseHandler {
  async handleSetNotifications(ctx: BotContext): Promise<void> {
    const { chatId, threadId, error } = this.messageHelper.validateNotificationContext(ctx);
    if (error) {
      await ctx.reply(error, { message_thread_id: ctx.message?.message_thread_id });
      return;
    }

    if (!chatId || !threadId) {
      await ctx.reply('Ошибка: не удалось определить параметры чата.', {
        message_thread_id: ctx.message?.message_thread_id,
      });
      return;
    }

    try {
      await this.notificationService?.setNotificationThread(chatId, threadId);
      await ctx.reply('Уведомления о скидках будут приходить в этот топик!', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    } catch (error) {
      await ctx.reply('Произошла ошибка при настройке уведомлений.', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  }

  async handleRemoveNotifications(ctx: BotContext): Promise<void> {
    const { chatId, threadId, error } = this.messageHelper.validateNotificationContext(ctx);
    if (error) {
      await ctx.reply(error, { message_thread_id: ctx.message?.message_thread_id });
      return;
    }

    if (!chatId || !threadId) {
      await ctx.reply('Ошибка: не удалось определить параметры чата.', {
        message_thread_id: ctx.message?.message_thread_id,
      });
      return;
    }

    try {
      await this.notificationService?.removeNotificationSettings(chatId, threadId);
      await ctx.reply('Уведомления о скидках отключены для этого топика.', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    } catch (error) {
      await ctx.reply('Произошла ошибка при отключении уведомлений.', {
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  }
}

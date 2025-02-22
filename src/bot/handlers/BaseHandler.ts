import { Context, SessionFlavor } from 'grammy';
import { SessionData } from '../types/SessionData';
import { IGameService } from '../../types';
import { MessageHelper } from '../helpers/MessageHelper';
import { NotificationService } from '../../services/NotificationService';

export type BotContext = Context & SessionFlavor<SessionData>;

export abstract class BaseHandler {
  constructor(
    protected gameService: IGameService,
    protected messageHelper: MessageHelper,
    protected notificationService?: NotificationService
  ) {}

  protected async validateUser(ctx: BotContext): Promise<boolean> {
    if (!ctx.from?.id) {
      await ctx.reply('❌ Не удалось определить пользователя', {
        message_thread_id: ctx.message?.message_thread_id,
      });
      return false;
    }
    return true;
  }

  protected getThreadId(ctx: BotContext): number | undefined {
    return ctx.message?.message_thread_id;
  }
}

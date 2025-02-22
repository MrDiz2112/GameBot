import { BaseHandler, BotContext } from './BaseHandler';

export class BasicCommandHandler extends BaseHandler {
  async handleStart(ctx: BotContext): Promise<void> {
    const isGroup = ctx.chat?.type === 'supergroup';
    const message = this.messageHelper.getStartMessage(isGroup);
    await ctx.reply(message, {
      message_thread_id: this.getThreadId(ctx),
    });
  }

  async handleHelp(ctx: BotContext): Promise<void> {
    const isGroup = ctx.chat?.type === 'supergroup';
    const message = this.messageHelper.getHelpMessage(isGroup);
    await ctx.reply(message, {
      message_thread_id: this.getThreadId(ctx),
    });
  }
}

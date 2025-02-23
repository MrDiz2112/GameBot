/// <reference types="node" />
import { BaseHandler, BotContext } from './BaseHandler';
import { InlineKeyboard } from 'grammy';
import { PrismaClient, Prisma } from '@prisma/client';
import { IGameService } from '../../types';
import { MessageHelper } from '../helpers/MessageHelper';
import logger from '../../utils/logger';

type PartyWithMembers = Prisma.PartyGetPayload<{
  include: { members: true };
}>;

interface PartyMember {
  username: string;
}

export class PartyCommandHandler extends BaseHandler {
  private prisma: PrismaClient;

  constructor(gameService: IGameService, messageHelper: MessageHelper) {
    super(gameService, messageHelper);
    this.prisma = new PrismaClient();
  }

  private async deleteMessages(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.session.messageIdsToDelete?.length) return;

    const deletePromises = ctx.session.messageIdsToDelete.map(async messageId => {
      try {
        await ctx.api.deleteMessage(chatId, messageId);
      } catch (error) {
        // Игнорируем ошибки для сообщений, которые уже удалены или недоступны
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('message to delete not found') ||
          errorMessage.includes("message can't be deleted")
        ) {
          logger.debug('Message already deleted or cannot be deleted', { messageId });
        } else {
          logger.warn('Failed to delete message', { messageId, error });
        }
      }
    });

    await Promise.all(deletePromises);
    ctx.session.messageIdsToDelete = [];
  }

  private updateMessageIds(ctx: BotContext, messageId: number): void {
    ctx.session.messageIdsToDelete = ctx.session.messageIdsToDelete || [];
    ctx.session.messageIdsToDelete.push(messageId);
  }

  async handleCreateParty(ctx: BotContext): Promise<void> {
    logger.debug('Handling /create_party command', { chatId: ctx.chat?.id });

    if (!(await this.validateUser(ctx))) {
      return;
    }

    const threadId = this.getThreadId(ctx);

    ctx.session.partyState = {
      step: 'name',
      currentParty: {
        threadId,
      },
    };

    const message = await ctx.reply('Пожалуйста, введите название группы:', {
      message_thread_id: threadId,
    });

    ctx.session.messageIdsToDelete = [message.message_id];
    if (ctx.message?.message_id) {
      ctx.session.messageIdsToDelete.push(ctx.message.message_id);
    }
  }

  async handleParty(ctx: BotContext): Promise<void> {
    logger.debug('Handling /party command', { chatId: ctx.chat?.id });

    if (!(await this.validateUser(ctx))) {
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const threadId = this.getThreadId(ctx);

    // Сохраняем ID командного сообщения для последующего удаления
    ctx.session.messageIdsToDelete = [];
    if (ctx.message?.message_id) {
      this.updateMessageIds(ctx, ctx.message.message_id);
    }

    const parties = await this.prisma.party.findMany({
      where: { chatId: BigInt(chatId) },
      include: { members: true },
    });

    if (parties.length === 0) {
      const msg = await ctx.reply(
        'В этом чате пока нет созданных групп. Создайте новую группу с помощью команды /create_party',
        { message_thread_id: threadId }
      );
      this.updateMessageIds(ctx, msg.message_id);
      return;
    }

    const keyboard = new InlineKeyboard();
    parties.forEach((party: PartyWithMembers) => {
      keyboard.text(party.name, `party:${party.id}:${threadId}:${ctx.message?.message_id}`).row();
    });

    const msg = await ctx.reply('Выберите группу:', {
      reply_markup: keyboard,
      message_thread_id: threadId,
    });
    this.updateMessageIds(ctx, msg.message_id);
  }

  async handlePartyMessage(ctx: BotContext): Promise<void> {
    if (!ctx.session.partyState || !ctx.message?.text) {
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const threadId = this.getThreadId(ctx);

    // Сохраняем ID входящего сообщения
    if (ctx.message.message_id) {
      this.updateMessageIds(ctx, ctx.message.message_id);
    }

    let membersMsg;
    let messageMsg;
    let errorMsg;
    let successMsg;
    let membersList: string[];
    let message: string;

    switch (ctx.session.partyState.step) {
      case 'name':
        await this.deleteMessages(ctx);
        ctx.session.partyState.currentParty = {
          ...ctx.session.partyState.currentParty,
          name: ctx.message.text,
          threadId,
        };
        ctx.session.partyState.step = 'members';
        membersMsg = await ctx.reply(
          'Теперь отправьте список участников через пробел или с новой строки (используя @-упоминания), например:\n@user1 @user2 @user3\nили\n@user1\n@user2\n@user3',
          { message_thread_id: threadId }
        );
        this.updateMessageIds(ctx, membersMsg.message_id);
        break;

      case 'members':
        membersList = ctx.message.text
          .split(/[\s\n]+/)
          .map((username: string) => username.trim())
          .filter((username: string) => username.startsWith('@'))
          .map((username: string) => username.substring(1));

        if (membersList.length === 0) {
          await this.deleteMessages(ctx);
          errorMsg = await ctx.reply(
            'Пожалуйста, укажите хотя бы одного участника, используя @-упоминания (через пробел или с новой строки).',
            { message_thread_id: threadId }
          );
          this.updateMessageIds(ctx, errorMsg.message_id);
          return;
        }

        await this.deleteMessages(ctx);
        ctx.session.partyState.currentParty = {
          ...ctx.session.partyState.currentParty,
          members: membersList.map((username: string) => ({ username })),
        };
        ctx.session.partyState.step = 'message';
        messageMsg = await ctx.reply(
          'Отлично! Теперь вы можете задать сообщение, которое будет отправляться при вызове группы (или нажмите /skip для использования стандартного сообщения "Народ, собираемся?"):',
          { message_thread_id: threadId }
        );
        this.updateMessageIds(ctx, messageMsg.message_id);
        break;

      case 'message':
        if (
          !ctx.session.partyState.currentParty?.name ||
          !ctx.session.partyState.currentParty?.members
        ) {
          return;
        }

        message = ctx.message.text === '/skip' ? 'Народ, собираемся?' : ctx.message.text;

        try {
          const newParty = await this.prisma.party.create({
            data: {
              name: ctx.session.partyState.currentParty.name,
              message,
              chatId: BigInt(chatId),
              threadId: threadId ? BigInt(threadId) : null,
              members: {
                create: ctx.session.partyState.currentParty.members.map((member: PartyMember) => ({
                  username: member.username || '',
                })),
              },
            },
            include: { members: true },
          });

          await this.deleteMessages(ctx);
          successMsg = await ctx.reply(`✅ Группа "${newParty.name}" успешно создана!`, {
            message_thread_id: threadId,
          });
          this.updateMessageIds(ctx, successMsg.message_id);

          // Удаляем сообщение об успехе через 3 секунды
          setTimeout(async () => {
            await this.deleteMessages(ctx);
          }, 3000);
        } catch (error) {
          logger.error('Failed to create party', { error });
          await ctx.reply('❌ Произошла ошибка при создании группы', {
            message_thread_id: threadId,
          });
        }

        ctx.session.partyState = undefined;
        break;
    }
  }

  async handlePartySelection(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.callbackQuery?.data) {
      return;
    }

    if (!ctx.callbackQuery.data.startsWith('party:')) {
      return;
    }

    const [, partyIdStr, threadIdStr, commandMessageIdStr] = ctx.callbackQuery.data.split(':');
    const partyId = parseInt(partyIdStr);
    const threadId = parseInt(threadIdStr);
    const commandMessageId = commandMessageIdStr ? parseInt(commandMessageIdStr) : undefined;

    try {
      const selectedParty = await this.prisma.party.findUnique({
        where: { id: partyId },
        include: { members: true },
      });

      if (!selectedParty) {
        await ctx.answerCallbackQuery({
          text: '❌ Группа не найдена',
        });
        return;
      }

      const membersText = selectedParty.members
        .map((member: { username: string }) => `@${member.username}`)
        .join(' ');

      await ctx.answerCallbackQuery();

      // Удаляем все предыдущие сообщения перед отправкой финального
      if (ctx.callbackQuery.message?.message_id) {
        this.updateMessageIds(ctx, ctx.callbackQuery.message.message_id);
      }
      if (commandMessageId) {
        this.updateMessageIds(ctx, commandMessageId);
      }
      await this.deleteMessages(ctx);

      // Отправляем финальное сообщение с упоминаниями (его не удаляем)
      await ctx.reply(`${selectedParty.message}\n\n${membersText}`, {
        message_thread_id: threadId,
      });
    } catch (error) {
      logger.error('Failed to handle party selection', { error });
      await ctx.answerCallbackQuery({
        text: '❌ Произошла ошибка при выборе группы',
      });
    }
  }
}

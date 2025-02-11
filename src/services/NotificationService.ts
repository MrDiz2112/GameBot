import { PrismaClient, Prisma } from '@prisma/client';
import { Bot } from 'grammy';
import { IGameService, BotContext } from '../types';
import logger from '../utils/logger';

export class NotificationService {
  private prisma: PrismaClient;
  private bot: Bot<BotContext>;
  private gameService: IGameService;

  constructor(bot: Bot<BotContext>, gameService: IGameService) {
    this.prisma = new PrismaClient();
    this.bot = bot;
    this.gameService = gameService;
    logger.info('NotificationService initialized');
  }

  async setNotificationThread(chatId: number, threadId: number): Promise<void> {
    logger.debug('Setting notification thread', { chatId, threadId });
    try {
      const data: Prisma.NotificationSettingsCreateInput = {
        chatId: BigInt(chatId),
        threadId: BigInt(threadId),
        isGroup: true
      };

      await this.prisma.notificationSettings.upsert({
        where: {
          chatId_threadId: {
            chatId: BigInt(chatId),
            threadId: BigInt(threadId)
          }
        },
        update: {},
        create: data
      });
      logger.info('Notification thread set successfully', { chatId, threadId });
    } catch (error) {
      logger.error('Failed to set notification thread', { chatId, threadId, error });
      throw error;
    }
  }

  async removeNotificationSettings(chatId: number, threadId: number): Promise<void> {
    logger.debug('Removing notification settings', { chatId, threadId });
    try {
      await this.prisma.notificationSettings.delete({
        where: {
          chatId_threadId: {
            chatId: BigInt(chatId),
            threadId: BigInt(threadId)
          }
        }
      });
      logger.info('Notification settings removed successfully', { chatId, threadId });
    } catch (error) {
      logger.error('Failed to remove notification settings', { chatId, threadId, error });
      throw error;
    }
  }

  async checkPricesAndNotify(): Promise<void> {
    logger.debug('Starting price check and notification process');
    const games = await this.gameService.getGames();
    const settings = await this.prisma.notificationSettings.findMany();
    logger.info('Found games and notification settings', {
      gamesCount: games.length,
      settingsCount: settings.length
    });

    for (const game of games) {
      try {
        const oldPrice = game.currentPrice;
        await this.gameService.updatePrice(game.id!);
        const updatedGame = await this.prisma.game.findUnique({
          where: { id: game.id }
        });

        if (!updatedGame || !oldPrice || !updatedGame.currentPrice) {
          logger.warn('Skipping game due to missing data', { gameId: game.id });
          continue;
        }

        // Если цена снизилась и игра не была помечена как со скидкой
        if (updatedGame.currentPrice < oldPrice && !updatedGame.onSale) {
          const discount = Math.round((1 - updatedGame.currentPrice / oldPrice) * 100);
          logger.info('Price drop detected', {
            gameId: game.id,
            title: updatedGame.title,
            oldPrice,
            newPrice: updatedGame.currentPrice,
            discount
          });

          const message =
            `🎮 ${updatedGame.title}\n` +
            `💰 Скидка ${discount}%!\n` +
            `Старая цена: ${oldPrice}\n` +
            `Новая цена: ${updatedGame.currentPrice}\n` +
            `🔗 ${updatedGame.url}`;

          // Отправляем уведомление во все настроенные чаты/топики
          for (const setting of settings) {
            try {
              if (setting.isGroup && setting.threadId) {
                await this.bot.api.sendMessage(setting.chatId.toString(), message, {
                  message_thread_id: Number(setting.threadId)
                });
                logger.debug('Notification sent to group thread', {
                  chatId: setting.chatId,
                  threadId: setting.threadId
                });
              } else {
                await this.bot.api.sendMessage(setting.chatId.toString(), message);
                logger.debug('Notification sent to chat', { chatId: setting.chatId });
              }
            } catch (error) {
              logger.error('Failed to send notification', {
                chatId: setting.chatId,
                threadId: setting.threadId,
                error
              });
            }
          }

          // Помечаем игру как со скидкой
          await this.prisma.game.update({
            where: { id: game.id },
            data: { onSale: true }
          });
          logger.debug('Game marked as on sale', { gameId: game.id });
        }
        // Если цена вернулась к исходной или выше
        else if (updatedGame.currentPrice >= oldPrice && updatedGame.onSale) {
          await this.prisma.game.update({
            where: { id: game.id },
            data: { onSale: false }
          });
          logger.debug('Game marked as not on sale', { gameId: game.id });
        }
      } catch (error) {
        logger.error('Failed to check price for game', {
          gameId: game.id,
          error
        });
      }
    }
    logger.info('Price check and notification process completed');
  }

  async getNotificationSettings(chatId: number): Promise<any[]> {
    logger.debug('Getting notification settings', { chatId });
    try {
      const settings = await this.prisma.notificationSettings.findMany({
        where: {
          chatId: BigInt(chatId)
        }
      });
      logger.debug('Notification settings retrieved', {
        chatId,
        settingsCount: settings.length
      });
      return settings;
    } catch (error) {
      logger.error('Failed to get notification settings', { chatId, error });
      throw error;
    }
  }
}
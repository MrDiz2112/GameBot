import { Context } from 'grammy';
import { SessionFlavor } from 'grammy';
import { SessionData } from '../types/SessionData';
import { IGame } from '../../types';

type BotContext = Context & SessionFlavor<SessionData>;

export class MessageHelper {
  getStartMessage(isGroup: boolean): string {
    return isGroup
      ? 'Привет! Я бот для отслеживания игр. \n\n' +
          'Доступные команды:\n' +
          '/add - Добавить новую игру\n' +
          '/list - Показать список игр\n' +
          '/check_prices - Проверить цены\n' +
          '/categories - Показать список категорий и количество игр\n' +
          '/add_category - Добавить новую категорию\n' +
          '/set_notifications - Настроить уведомления о скидках в текущем топике\n' +
          '/remove_notifications - Отключить уведомления в текущем топике\n' +
          '/help - Показать помощь'
      : 'Привет! Я бот для отслеживания игр. \n\n' +
          'Для использования бота добавьте меня в группу с топиками.\n' +
          'Там вы сможете настроить уведомления о скидках в нужном топике.';
  }

  getHelpMessage(isGroup: boolean): string {
    return isGroup
      ? 'Команды бота:\n\n' +
          '/add - Добавить новую игру\n' +
          '/list - Показать список игр\n' +
          '/check_prices - Проверить цены\n' +
          '/categories - Показать список категорий и количество игр\n' +
          '/add_category - Добавить новую категорию\n' +
          '/set_notifications - Настроить уведомления о скидках в текущем топике\n' +
          '/remove_notifications - Отключить уведомления в текущем топике\n' +
          '/help - Показать это сообщение\n\n' +
          'Для добавления игры:\n' +
          '1. Используйте команду /add\n' +
          '2. Отправьте ссылку на игру в Steam\n' +
          '3. Укажите количество игроков (по умолчанию: 1)\n' +
          '4. Укажите категорию игры\n\n' +
          'Для работы с категориями:\n' +
          '1. /categories - посмотреть все категории и количество игр в них\n' +
          '2. /add_category <название> - создать новую категорию'
      : 'Для использования бота добавьте меня в группу с топиками.\n' +
          'Там вы сможете настроить уведомления о скидках в нужном топике.';
  }

  initializeAddSession(ctx: BotContext): SessionData {
    return {
      gameUrl: undefined,
      category: undefined,
      awaitingCategories: false,
      awaitingPlayers: false,
      players: undefined,
      awaitingGameUrl: true,
      userId: ctx.from?.id,
      step: 'url',
      messageIdsToDelete: [],
    };
  }

  validateNotificationContext(ctx: BotContext): {
    chatId?: number;
    threadId?: number;
    error?: string;
  } {
    const chatId = ctx.chat?.id;
    const threadId = ctx.message?.message_thread_id;

    if (!chatId) {
      return { error: 'Ошибка: не удалось определить чат.' };
    }

    if (ctx.chat?.type !== 'supergroup') {
      return { error: 'Эта команда доступна только в группах с топиками.' };
    }

    if (!threadId) {
      return { error: 'Эта команда должна быть использована в топике.' };
    }

    return { chatId, threadId };
  }

  formatGamesList(games: IGame[]): string {
    if (games.length === 0) {
      return 'Список игр пуст';
    }

    const gamesByCategory = this.groupGamesByCategory(games);
    return this.formatGamesByCategory(gamesByCategory);
  }

  formatCategoriesList(categories: { name: string; gamesCount: number }[]): string {
    if (categories.length === 0) {
      return '📝 Список категорий пуст';
    }

    const message = categories.map(cat => `📁 ${cat.name}: ${cat.gamesCount} игр`).join('\n');

    return `📊 Категории:\n\n${message}`;
  }

  private groupGamesByCategory(games: IGame[]): Record<string, IGame[]> {
    return games.reduce(
      (acc, game) => {
        const category = game.category || 'Без категории';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(game);
        return acc;
      },
      {} as Record<string, IGame[]>
    );
  }

  private formatGamesByCategory(gamesByCategory: Record<string, IGame[]>): string {
    return Object.entries(gamesByCategory)
      .map(([category, categoryGames]) => {
        const header = `\\-\\-\\-\\-\\-\\- *${category}* \\-\\-\\-\\-\\-\\-\n\n`;
        const gamesList = categoryGames
          .map(game => {
            const escapedTitle = game.title.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
            const name = `[${escapedTitle}](${game.url})`;
            const price = `${game.basePrice > game.currentPrice ? `~${game.basePrice}~ ` : ''}${game.currentPrice} руб\\.`;
            const players = `${game.players} чел\\.`;
            return `\\- ${name} \\(${players}\\) \\- ${price}`;
          })
          .join('\n');
        return `${header}${gamesList}`;
      })
      .join('\n\n');
  }
}

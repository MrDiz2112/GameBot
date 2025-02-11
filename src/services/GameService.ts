import { PrismaClient } from '@prisma/client';
import { IGame, IGameService, IParser } from '../types';
import logger from '../utils/logger';

export class GameService implements IGameService {
  private prisma: PrismaClient;
  public parser: IParser;

  constructor(parser: IParser) {
    this.prisma = new PrismaClient();
    this.parser = parser;
    logger.info('GameService initialized');
  }

  async addGame(gameData: IGame): Promise<IGame> {
    logger.debug('Adding new game', { url: gameData.url });
    try {
      const parsedGame = await this.parser.parseGame(gameData.url);

      if (!parsedGame.title || !parsedGame.platform) {
        throw new Error('Missing required game data');
      }

      const categories = gameData.categories || [];
      const tags = parsedGame.tags || [];

      const game = await this.prisma.game.create({
        data: {
          title: parsedGame.title,
          url: gameData.url,
          basePrice: parsedGame.basePrice,
          currentPrice: parsedGame.currentPrice,
          platform: parsedGame.platform,
          lastChecked: new Date(),
          categories: {
            connectOrCreate: categories.map(category => ({
              where: { name: category },
              create: { name: category },
            })),
          },
          tags: {
            connectOrCreate: tags.map(tag => ({
              where: { name: tag },
              create: { name: tag },
            })),
          },
        },
        include: {
          categories: true,
          tags: true,
        },
      });

      logger.info('Game added successfully', {
        id: game.id,
        title: game.title,
      });

      return this.mapGameToInterface(game);
    } catch (error) {
      logger.error('Failed to add game', { url: gameData.url, error });
      throw error;
    }
  }

  async removeGame(id: number): Promise<void> {
    logger.debug('Removing game', { id });
    try {
      await this.prisma.game.delete({
        where: { id },
      });
      logger.info('Game removed successfully', { id });
    } catch (error) {
      logger.error('Failed to remove game', { id, error });
      throw error;
    }
  }

  async updateGame(id: number, gameData: Partial<IGame>): Promise<IGame> {
    logger.debug('Updating game', { id, data: gameData });
    try {
      const game = await this.prisma.game.update({
        where: { id },
        data: {
          ...gameData,
          categories: gameData.categories
            ? {
                set: [],
                connectOrCreate: gameData.categories.map(category => ({
                  where: { name: category },
                  create: { name: category },
                })),
              }
            : undefined,
          tags: gameData.tags
            ? {
                set: [],
                connectOrCreate: gameData.tags.map(tag => ({
                  where: { name: tag },
                  create: { name: tag },
                })),
              }
            : undefined,
        },
        include: {
          categories: true,
          tags: true,
        },
      });

      logger.info('Game updated successfully', { id });
      return this.mapGameToInterface(game);
    } catch (error) {
      logger.error('Failed to update game', { id, error });
      throw error;
    }
  }

  async getGames(): Promise<IGame[]> {
    logger.debug('Getting all games');
    try {
      const games = await this.prisma.game.findMany({
        include: {
          categories: true,
          tags: true,
        },
      });

      logger.info('Games retrieved successfully', { count: games.length });
      return games.map(this.mapGameToInterface);
    } catch (error) {
      logger.error('Failed to get games', { error });
      throw error;
    }
  }

  async updatePrice(id: number): Promise<void> {
    logger.debug('Updating game price', { id });
    try {
      const game = await this.prisma.game.findUnique({
        where: { id },
      });

      if (!game) {
        logger.warn('Game not found', { id });
        throw new Error('Game not found');
      }

      const priceInfo = await this.parser.parsePrice(game.url);

      await this.prisma.game.update({
        where: { id },
        data: {
          currentPrice: priceInfo.discount ?? priceInfo.basePrice,
          basePrice: priceInfo.basePrice,
          lastChecked: new Date(),
        },
      });

      logger.info('Game price updated successfully', {
        id,
        basePrice: priceInfo.basePrice,
        currentPrice: priceInfo.discount ?? priceInfo.basePrice,
        discount: priceInfo.discount,
      });
    } catch (error) {
      logger.error('Failed to update game price', { id, error });
      throw error;
    }
  }

  private mapGameToInterface(game: {
    id: number;
    title: string;
    url: string;
    basePrice: number;
    currentPrice: number;
    lastChecked: Date | null;
    platform: string;
    categories?: { name: string }[];
    tags?: { name: string }[];
  }): IGame {
    return {
      id: game.id,
      title: game.title,
      url: game.url,
      basePrice: game.basePrice,
      currentPrice: game.currentPrice,
      lastChecked: game.lastChecked ?? undefined,
      platform: game.platform,
      categories: game.categories?.map(c => c.name) || [],
      tags: game.tags?.map(t => t.name) || [],
    };
  }
}

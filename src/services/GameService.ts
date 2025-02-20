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

      const { category, id: _id, tags: _tags, ...restGameData } = gameData;
      const tags = parsedGame.tags || [];

      let categoryId: number | undefined;
      if (category) {
        const categoryRecord = await this.prisma.category.upsert({
          where: { name: category },
          create: { name: category },
          update: {},
        });
        categoryId = categoryRecord.id;
      }

      const game = await this.prisma.game.create({
        data: {
          title: parsedGame.title,
          url: restGameData.url,
          basePrice: parsedGame.basePrice,
          currentPrice: parsedGame.currentPrice,
          players: restGameData.players || 1,
          platform: parsedGame.platform,
          lastChecked: new Date(),
          categoryId,
          tags: {
            connectOrCreate: tags.map((tag: string) => ({
              where: { name: tag },
              create: { name: tag },
            })),
          },
        },
        include: {
          category: true,
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
      let categoryId: number | undefined;
      if (gameData.category) {
        const categoryRecord = await this.prisma.category.upsert({
          where: { name: gameData.category },
          create: { name: gameData.category },
          update: {},
        });
        categoryId = categoryRecord.id;
      }

      const { category: _category, id: _id, tags: _tags, ...prismaUpdateData } = gameData;

      const game = await this.prisma.game.update({
        where: { id },
        data: {
          ...prismaUpdateData,
          categoryId,
          tags: gameData.tags
            ? {
                set: [],
                connectOrCreate: gameData.tags.map((tag: string) => ({
                  where: { name: tag },
                  create: { name: tag },
                })),
              }
            : undefined,
        },
        include: {
          category: true,
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
          category: true,
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

  async getCategories(): Promise<string[]> {
    logger.debug('Getting all categories');
    try {
      const categories = await this.prisma.category.findMany({
        select: {
          name: true,
        },
      });

      logger.info('Categories retrieved successfully', { count: categories.length });
      return categories.map(c => c.name);
    } catch (error) {
      logger.error('Failed to get categories', { error });
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

  async getCategoriesWithGameCount(): Promise<Array<{ name: string; gamesCount: number }>> {
    logger.debug('Getting categories with game count');
    try {
      const categoriesWithCount = await this.prisma.category.findMany({
        select: {
          name: true,
          _count: {
            select: {
              games: true,
            },
          },
        },
      });

      const result = categoriesWithCount.map(category => ({
        name: category.name,
        gamesCount: category._count.games,
      }));

      logger.info('Categories with count retrieved successfully', { count: result.length });
      return result;
    } catch (error) {
      logger.error('Failed to get categories with count', { error });
      throw error;
    }
  }

  async createCategory(name: string): Promise<{ id: number; name: string }> {
    logger.debug('Creating new category', { name });
    try {
      const category = await this.prisma.category.create({
        data: { name },
      });

      logger.info('Category created successfully', { id: category.id, name: category.name });
      return category;
    } catch (error) {
      logger.error('Failed to create category', { name, error });
      throw error;
    }
  }

  private mapGameToInterface(game: {
    id: number;
    title: string;
    url: string;
    players: number;
    basePrice: number;
    currentPrice: number;
    lastChecked: Date | null;
    platform: string;
    category?: { name: string } | null;
    tags?: { name: string }[];
  }): IGame {
    return {
      id: game.id,
      title: game.title,
      url: game.url,
      players: game.players,
      basePrice: game.basePrice,
      currentPrice: game.currentPrice,
      lastChecked: game.lastChecked ?? undefined,
      platform: game.platform,
      category: game.category?.name,
      tags: game.tags?.map(t => t.name) || [],
    };
  }
}

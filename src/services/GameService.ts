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

  async addGame(gameData: IGame): Promise<void> {
    logger.debug('Adding new game with data', {
      gameData,
      url: gameData.url,
      players: gameData.players,
      category: gameData.category,
    });
    try {
      const parsedGame = await this.parser.parseGame(gameData.url);
      logger.debug('Parsed game data', { parsedGame });

      if (!parsedGame.title || !parsedGame.platform) {
        throw new Error('Missing required game data');
      }

      const { category, players, ...restGameData } = gameData;
      logger.debug('Destructured game data', {
        category,
        players,
        restGameData,
      });

      const tags = parsedGame.tags || [];

      let categoryId: number | undefined;
      if (category) {
        const categoryRecord = await this.prisma.category.upsert({
          where: { name: category },
          create: { name: category },
          update: {},
        });
        categoryId = categoryRecord.id;
        logger.debug('Category record created/updated', { categoryRecord });
      }

      const prismaData = {
        title: parsedGame.title,
        url: restGameData.url,
        basePrice: parsedGame.basePrice || gameData.basePrice || 0,
        currentPrice: parsedGame.currentPrice || gameData.currentPrice || 0,
        players: players ? Number(players) : 1,
        platform: parsedGame.platform,
        lastChecked: new Date(),
        categoryId,
        tags: {
          connectOrCreate: tags.map((tag: string) => ({
            where: { name: tag },
            create: { name: tag },
          })),
        },
      };
      logger.debug('Preparing Prisma create data', { prismaData });

      await this.prisma.game.create({
        data: prismaData,
        include: {
          category: true,
          tags: true,
        },
      });

      logger.info('Game added successfully');
    } catch (error) {
      logger.error('Failed to add game', {
        url: gameData.url,
        error,
        gameData,
      });
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

  async updateGame(id: number, gameData: Partial<IGame>): Promise<void> {
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

      const prismaUpdateData = {
        title: gameData.title,
        url: gameData.url,
        basePrice: gameData.basePrice,
        currentPrice: gameData.currentPrice,
        players: gameData.players,
        platform: gameData.platform,
        lastChecked: gameData.lastChecked,
      };

      await this.prisma.game.update({
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

  async getGame(id: number): Promise<IGame | null> {
    logger.debug('Getting game by id', { id });
    try {
      const game = await this.prisma.game.findUnique({
        where: { id },
        include: {
          category: true,
          tags: true,
        },
      });

      if (!game) {
        logger.info('Game not found', { id });
        return null;
      }

      logger.info('Game retrieved successfully', { id });
      return this.mapGameToInterface(game);
    } catch (error) {
      logger.error('Failed to get game', { id, error });
      throw error;
    }
  }

  async checkPrices(): Promise<void> {
    logger.debug('Checking prices for all games');
    try {
      const games = await this.getGames();
      for (const game of games) {
        if (game.id) {
          await this.updatePrice(game.id);
        }
      }
      logger.info('Prices checked successfully for all games');
    } catch (error) {
      logger.error('Failed to check prices', { error });
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
        select: {
          id: true,
          url: true,
          basePrice: true,
          currentPrice: true,
        },
      });

      if (!game) {
        logger.warn('Game not found', { id });
        throw new Error('Game not found');
      }

      logger.debug('Current game state', { game });

      const priceInfo = await this.parser.parsePrice(game.url);
      logger.debug('Raw price info from parser', {
        priceInfo,
        basePrice: {
          value: priceInfo.basePrice,
          type: typeof priceInfo.basePrice,
        },
        discount: {
          value: priceInfo.discount,
          type: typeof priceInfo.discount,
        },
      });

      // Попытка преобразовать и валидировать basePrice
      let basePrice: number;
      try {
        basePrice = Number(priceInfo.basePrice);
        if (isNaN(basePrice) || basePrice < 0) {
          throw new Error(`Invalid basePrice value: ${priceInfo.basePrice}`);
        }
      } catch (e) {
        logger.error('Failed to parse basePrice', {
          originalValue: priceInfo.basePrice,
          error: e,
        });
        // Если не удалось получить новую цену, используем текущую
        basePrice = game.basePrice;
        logger.info('Using current basePrice as fallback', { basePrice });
      }

      // Попытка преобразовать и валидировать currentPrice
      let currentPrice: number;
      try {
        if (
          typeof priceInfo.discount === 'number' &&
          !isNaN(priceInfo.discount) &&
          priceInfo.discount >= 0
        ) {
          currentPrice = priceInfo.discount;
        } else {
          currentPrice = basePrice;
        }
      } catch (e) {
        logger.error('Failed to parse currentPrice', {
          discount: priceInfo.discount,
          error: e,
        });
        currentPrice = basePrice;
      }

      const updateData = {
        currentPrice,
        basePrice,
        lastChecked: new Date(),
      };

      logger.debug('Updating game with data', {
        updateData,
        types: {
          currentPrice: typeof currentPrice,
          basePrice: typeof basePrice,
        },
        values: {
          current: currentPrice,
          base: basePrice,
        },
      });

      const updatedGame = await this.prisma.game.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          basePrice: true,
          currentPrice: true,
          lastChecked: true,
        },
      });

      logger.info('Game price updated successfully', {
        before: {
          basePrice: game.basePrice,
          currentPrice: game.currentPrice,
        },
        after: updatedGame,
        updateData,
      });
    } catch (error) {
      logger.error('Failed to update game price', {
        id,
        error,
        errorType: typeof error,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
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

  async getGamesByPlayerCount(maxPlayers: number): Promise<IGame[]> {
    logger.debug('Getting games by player count', { maxPlayers });
    try {
      const games = await this.prisma.game.findMany({
        where: {
          players: {
            gte: maxPlayers,
          },
        },
        include: {
          category: true,
          tags: true,
        },
        orderBy: {
          players: 'asc',
        },
      });

      logger.info('Games retrieved successfully by player count', { count: games.length });
      return games.map(this.mapGameToInterface);
    } catch (error) {
      logger.error('Failed to get games by player count', { maxPlayers, error });
      throw error;
    }
  }
}

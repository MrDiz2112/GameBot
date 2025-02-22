import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  gameUrl?: string;
  categories?: string[];
  awaitingCategories?: boolean;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export interface GamePrice {
  basePrice: number;
  discount?: number;
}

export interface IGame {
  id?: number;
  title: string;
  url: string;
  basePrice: number;
  currentPrice: number;
  lastChecked?: Date;
  platform: string;
  players: number;
  category?: string;
  tags?: string[];
}

export interface IGameService {
  parser: IParser;
  addGame(game: IGame): Promise<void>;
  getGames(): Promise<IGame[]>;
  getGame(id: number): Promise<IGame | null>;
  removeGame(id: number): Promise<void>;
  updateGame(id: number, updates: Partial<IGame>): Promise<void>;
  getCategories(): Promise<string[]>;
  checkPrices(): Promise<void>;
  updatePrice(id: number): Promise<void>;
  getCategoriesWithGameCount(): Promise<Array<{ name: string; gamesCount: number }>>;
  createCategory(name: string): Promise<{ id: number; name: string }>;
}

export interface IParser {
  parseGame(url: string): Promise<IGame>;
  parsePrice(url: string): Promise<GamePrice>;
}

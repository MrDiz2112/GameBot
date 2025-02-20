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
  addGame(game: IGame): Promise<IGame>;
  removeGame(id: number): Promise<void>;
  updateGame(id: number, game: Partial<IGame>): Promise<IGame>;
  getGames(): Promise<IGame[]>;
  updatePrice(id: number): Promise<void>;
  getCategories(): Promise<string[]>;
}

export interface IParser {
  parseGame(url: string): Promise<IGame>;
  parsePrice(url: string): Promise<GamePrice>;
}

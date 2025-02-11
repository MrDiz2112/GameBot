import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  gameUrl?: string;
  categories?: string[];
  awaitingCategories?: boolean;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export interface GamePrice {
  price: number;
  discount?: number;
}

export interface IGame {
  id?: number;
  title: string;
  url: string;
  price: GamePrice;
  lastChecked?: Date;
  platform: string;
  categories?: string[];
  tags?: string[];
}

export interface IGameService {
  parser: IParser;
  addGame(game: IGame): Promise<IGame>;
  removeGame(id: number): Promise<void>;
  updateGame(id: number, game: Partial<IGame>): Promise<IGame>;
  getGames(): Promise<IGame[]>;
  updatePrice(id: number): Promise<void>;
}

export interface IParser {
  parseGame(url: string): Promise<Partial<IGame>>;
  parsePrice(url: string): Promise<GamePrice>;
}

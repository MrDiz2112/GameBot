export interface SessionData {
  gameUrl?: string;
  category?: string;
  awaitingCategories?: boolean;
  awaitingPlayers?: boolean;
  players?: number;
  awaitingGameUrl?: boolean;
  userId?: number;
  step?: 'url' | 'players' | 'category' | null;
  messageIdsToDelete?: number[];
}

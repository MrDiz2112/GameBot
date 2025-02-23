import { PartyState } from './PartyTypes';

export interface SessionData {
  gameUrl?: string;
  category?: string;
  awaitingCategories?: boolean;
  awaitingPlayers?: boolean;
  players?: number;
  awaitingGameUrl?: boolean;
  userId?: number;
  gameId?: number;
  step?: 'url' | 'players' | 'category' | 'edit_category' | 'edit_players' | null;
  messageIdsToDelete?: number[];
  partyState?: PartyState;
}

export interface Party {
  name: string;
  members: Array<{
    id: number;
    username?: string;
  }>;
  message?: string;
  threadId?: number;
}

export interface PartyState {
  step: 'name' | 'members' | 'message' | null;
  currentParty?: {
    name?: string;
    members?: Array<{
      username: string;
    }>;
    message?: string;
    threadId?: number;
  };
}

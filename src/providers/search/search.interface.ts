export type SourceTier = 1 | 2 | 3;

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  /**
   * Optional source-quality hint. 1 = institutional (universities, archives,
   * museums, encyclopedias, government sites), 2 = general (news, edited
   * informational sites), 3 = user-generated (social media, forums, reviews).
   * Not every provider tags every result; undefined means "unclassified".
   */
  tier?: SourceTier;
  snippet: string;
  content?: string;
  score?: number;
}

export interface SearchQuery {
  query: string;
  locationContext?: string;
  period?: { fromYear?: number; toYear?: number };
  maxResults?: number;
  /**
   * When true, the provider attempts a Wikipedia-restricted search first
   * and only falls back to a broad search if that returns nothing.
   * Default: true.
   */
  preferWikipedia?: boolean;
}

export interface SearchProvider {
  search(q: SearchQuery): Promise<SearchResult[]>;
}

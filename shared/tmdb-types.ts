// Shared TMDB Types (can be used by both client and server)

export interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  runtime?: number;
  number_of_seasons?: number;
  media_type?: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBMovieDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genres: TMDBGenre[];
  runtime?: number;
  number_of_seasons?: number;
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      profile_path: string | null;
    }>;
  };
  videos?: {
    results: Array<{
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
    }>;
  };
}

export interface TMDBResponse<T> {
  results: T[];
  total_pages: number;
  total_results: number;
  page?: number;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

export interface TMDBSearchParams {
  query?: string;
  with_genres?: string;
  primary_release_year?: number;
  'primary_release_date.gte'?: string;
  'primary_release_date.lte'?: string;
  'vote_average.gte'?: number;
  sort_by?: string;
  page?: number;
  include_adult?: boolean;
  language?: string;
}

export interface TMDBDiscoverParams extends TMDBSearchParams {
  with_original_language?: string;
  'vote_count.gte'?: number;
  with_runtime?: {
    gte?: number;
    lte?: number;
  };
}

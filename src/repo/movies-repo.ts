import type { InferSelectModel } from "drizzle-orm";
import type { movies } from "../schema";

export type Movie = InferSelectModel<typeof movies>;

export interface CreateMovieInput {
	title: string;
	releaseYear: number | null;
}

export interface UpdateMovieInput {
	title?: string;
	releaseYear?: number | null;
}

/**
 * Storage-agnostic repository for movies.
 * All methods are async so a single interface can back both the local
 * bun:sqlite driver and Cloudflare D1.
 */
export interface MoviesRepo {
	list(): Promise<Movie[]>;
	get(id: number): Promise<Movie | null>;
	create(input: CreateMovieInput): Promise<Movie>;
	update(id: number, updates: UpdateMovieInput): Promise<Movie | null>;
	remove(id: number): Promise<boolean>;
}

import type { CloudSong } from './cloudSongs';
import type { StoredSong } from './storage';
import type { Visibility } from './supabase';

/** Unified UI-side song type. Both cloud and local origins normalize to this. */
export interface Song {
  id: string;
  origin: 'cloud' | 'local';
  title: string;
  artist: string;
  originalKey?: string;
  source: string;
  visibility: Visibility | 'local';
  ownerId: string | null;
  parentId: string | null;
  seeded: boolean;
  createdAt: number;
  updatedAt: number;
  defaultCapo: number;
  tempo: number | null;
  tags: string[];
  likeCount: number;
  playCount: number;
}

export function fromCloud(s: CloudSong): Song {
  return {
    id: s.id,
    origin: 'cloud',
    title: s.title,
    artist: s.artist,
    originalKey: s.originalKey ?? undefined,
    source: s.source,
    visibility: s.visibility,
    ownerId: s.ownerId,
    parentId: s.parentId,
    seeded: s.seeded,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    defaultCapo: s.defaultCapo,
    tempo: s.tempo,
    tags: s.tags,
    likeCount: s.likeCount,
    playCount: s.playCount,
  };
}

export function fromLocal(s: StoredSong): Song {
  return {
    id: s.id,
    origin: 'local',
    title: s.title,
    artist: s.artist,
    originalKey: s.originalKey,
    source: s.source,
    visibility: 'local',
    ownerId: null,
    parentId: null,
    seeded: s.seeded === true,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    defaultCapo: s.defaultCapo ?? 0,
    tempo: s.tempo ?? null,
    tags: s.tags ?? [],
    likeCount: 0,
    playCount: 0,
  };
}

export function isEditable(song: Song, userId: string | null): boolean {
  if (song.seeded) return false;
  if (song.origin === 'local') return true; // anon-only local songs
  return song.ownerId !== null && song.ownerId === userId;
}

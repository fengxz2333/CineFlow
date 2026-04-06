import Dexie, { type Table } from 'dexie';

export interface Project {
  id?: number;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shot {
  id?: number;
  projectId: number;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'review' | 'approved';
  createdAt: Date;
  updatedAt: Date;
  thumbnailUrl?: string;
  customThumbnailUrl?: string;
  colorSpace?: string;
  namingConvention?: string;
  tags?: string[];
  notes?: string;
}

export interface Task {
  id?: number;
  shotId: number;
  name: string;
  status: 'pending' | 'in-progress' | 'review' | 'approved';
  assignee?: string;
  dependencies?: number[]; // Array of task IDs
  startDate?: Date;
  duration?: number; // in days
  createdAt: Date;
  updatedAt: Date;
}

export interface Version {
  id?: number;
  shotId: number;
  name: string; // Auto-generated name: PRJ-STG-v001-DATE
  stageName: string; // The stage this version belongs to
  versionNumber: number;
  videoUrl: string;
  videoBlob?: Blob;
  thumbnailUrl?: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    fps: number;
    duration: number;
    resolution: string;
    fileSize: number;
  };
}

export interface Annotation {
  id?: number;
  versionId: number;
  type: 'frame' | 'range';
  startTime: number; // in seconds
  endTime?: number; // in seconds (for range)
  content: string;
  author: string;
  createdAt: Date;
  drawingData?: string; // JSON string for doodle/pointers
}

export interface Reference {
  id?: number;
  shotId?: number; // Optional for project-level refs
  projectId?: number; // undefined = global (e.g. sfx-lib)
  type: 'image' | 'video' | 'audio';
  category: 'image-ref' | 'video-ref' | 'music-ref' | 'sfx-lib' | 'asset-lib';
  url: string;
  thumbnailUrl?: string;
  name: string;
  notes: string;
  createdAt: Date;
}

export class CineFlowDB extends Dexie {
  projects!: Table<Project>;
  shots!: Table<Shot>;
  tasks!: Table<Task>;
  versions!: Table<Version>;
  annotations!: Table<Annotation>;
  references!: Table<Reference>;

  constructor() {
    super('CineFlowDB');
    this.version(8).stores({
      projects: '++id, name',
      shots: '++id, projectId, name, status, tags, notes, namingConvention',
      tasks: '++id, shotId, name, status',
      versions: '++id, shotId, versionNumber, stageName',
      annotations: '++id, versionId, type, startTime',
      references: '++id, shotId, projectId, type'
    });
    this.version(9).stores({
      projects: '++id, name',
      shots: '++id, projectId, name, status, tags, notes, namingConvention',
      tasks: '++id, shotId, name, status',
      versions: '++id, shotId, versionNumber, stageName',
      annotations: '++id, versionId, type, startTime',
      references: '++id, shotId, projectId, type, category'
    }).upgrade(tx => {
      // Migrate existing references: assign category based on type
      return tx.table('references').toCollection().modify(ref => {
        if (ref.type === 'image') {
          ref.category = 'image-ref';
        } else if (ref.type === 'video') {
          ref.category = 'video-ref';
        } else {
          ref.category = 'music-ref';
        }
      });
    });
  }
}

export const db = new CineFlowDB();

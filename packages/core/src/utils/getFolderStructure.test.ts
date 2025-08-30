import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import fsPromises from 'fs/promises';
import * as fs from 'fs';
import { Dirent as FSDirent } from 'fs';
import * as nodePath from 'path';
import { getFolderStructure } from './getFolderStructure.js';
import * as gitUtils from './gitUtils.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

vi.mock('path', async (importOriginal) => {
  const original = (await importOriginal()) as typeof nodePath;
  return {
    ...original,
    resolve: vi.fn((str) => str),
    // Other path functions (basename, join, normalize, etc.) will use original implementation
  };
});

vi.mock('fs/promises');
vi.mock('fs');
vi.mock('./gitUtils.js');

// Import 'path' again here, it will be the mocked version
import * as path from 'path';

// Helper to create Dirent-like objects for mocking fs.readdir
const createDirent = (name: string, type: 'file' | 'dir'): FSDirent => ({
  name,
  isFile: () => type === 'file',
  isDirectory: () => type === 'dir',
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isSymbolicLink: () => false,
  isFIFO: () => false,
  isSocket: () => false,
  path: '',
  parentPath: '',
});

describe('getFolderStructure', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // path.resolve is now a vi.fn() due to the top-level vi.mock.
    // We ensure its implementation is set for each test (or rely on the one from vi.mock).
    // vi.resetAllMocks() clears call history but not the implementation set by vi.fn() in vi.mock.
    // If we needed to change it per test, we would do it here:
    (path.resolve as Mock).mockImplementation((str: string) => str);

    // Re-apply/define the mock implementation for fsPromises.readdir for each test
    (fsPromises.readdir as Mock).mockImplementation(
      async (dirPath: string | Buffer | URL) => {
        // path.normalize here will use the mocked path module.
        // Since normalize is spread from original, it should be the real one.
        const normalizedPath = path.normalize(dirPath.toString());
        if (mockFsStructure[normalizedPath]) {
          return mockFsStructure[normalizedPath];
        }
        throw Object.assign(
          new Error(
            `ENOENT: no such file or directory, scandir '${normalizedPath}'`,
          ),
          { code: 'ENOENT' },
        );
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restores spies (like fsPromises.readdir) and resets vi.fn mocks (like path.resolve)
  });

  const mockFsStructure: Record<string, FSDirent[]> = {
    [path.normalize('/testroot')]: [
      createDirent('file1.txt', 'file'),
      createDirent('subfolderA', 'dir'),
      createDirent('emptyFolder', 'dir'),
      createDirent('.hiddenfile', 'file'),
      createDirent('node_modules', 'dir'),
    ],
    [path.normalize('/testroot/subfolderA')]: [
      createDirent('fileA1.ts', 'file'),
      createDirent('fileA2.js', 'file'),
      createDirent('subfolderB', 'dir'),
    ],
    [path.normalize('/testroot/subfolderA/subfolderB')]: [createDirent('fileB1.md', 'file')],
    [path.normalize('/testroot/emptyFolder')]: [],
    [path.normalize('/testroot/node_modules')]: [createDirent('somepackage', 'dir')],
    [path.normalize('/testroot/manyFilesFolder')]: Array.from({ length: 10 }, (_, i) =>
      createDirent(`file-${i}.txt`, 'file'),
    ),
    [path.normalize('/testroot/manyFolders')]: Array.from({ length: 5 }, (_, i) =>
      createDirent(`folder-${i}`, 'dir'),
    ),
    ...Array.from({ length: 5 }, (_, i) => ({
      [path.normalize(`/testroot/manyFolders/folder-${i}`)]: [
        createDirent('child.txt', 'file'),
      ],
    })).reduce((acc, val) => ({ ...acc, ...val }), {}),
    [path.normalize('/testroot/deepFolders')]: [createDirent('level1', 'dir')],
    [path.normalize('/testroot/deepFolders/level1')]: [createDirent('level2', 'dir')],
    [path.normalize('/testroot/deepFolders/level1/level2')]: [createDirent('level3', 'dir')],
    [path.normalize('/testroot/deepFolders/level1/level2/level3')]: [
      createDirent('file.txt', 'file'),
    ],
  };

  it('should return basic folder structure', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/subfolderA'));
    const expected = `\nShowing up to 200 items (files + folders).\n\n${path.normalize('/testroot/subfolderA')}${path.sep}\n├───fileA1.ts\n├───fileA2.js\n└───subfolderB/\n    └───fileB1.md\n`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle an empty folder', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/emptyFolder'));
    const expected = `\nShowing up to 200 items (files + folders).\n\n${path.normalize('/testroot/emptyFolder')}${path.sep}\n`.trim();
    expect(structure.trim()).toBe(expected.trim());
  });

  it('should ignore folders specified in ignoredFolders (default)', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot'));
    const expected = `\nShowing up to 200 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (200 items) was reached.\n\n${path.normalize('/testroot')}${path.sep}\n├───.hiddenfile\n├───file1.txt\n├───emptyFolder/\n├───node_modules/...\n└───subfolderA/\n    ├───fileA1.ts\n    ├───fileA2.js\n    └───subfolderB/\n        └───fileB1.md\n`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should ignore folders specified in custom ignoredFolders', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot'), {
      ignoredFolders: new Set(['subfolderA', 'node_modules']),
    });
    const expected = `\nShowing up to 200 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (200 items) was reached.\n\n${path.normalize('/testroot')}${path.sep}\n├───.hiddenfile\n├───file1.txt\n├───emptyFolder/\n├───node_modules/...\n└───subfolderA/...\n`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should filter files by fileIncludePattern', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/subfolderA'), {
      fileIncludePattern: /\.ts$/,
    });
    const expected = `\nShowing up to 200 items (files + folders).\n\n${path.normalize('/testroot/subfolderA')}${path.sep}\n├───fileA1.ts\n└───subfolderB/\n`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle maxItems truncation for files within a folder', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/subfolderA'), {
      maxItems: 3,
    });
    const expected = `\nShowing up to 3 items (files + folders).\n\n${path.normalize('/testroot/subfolderA')}${path.sep}\n├───fileA1.ts\n├───fileA2.js\n└───subfolderB/\n`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle maxItems truncation for subfolders', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/manyFolders'), {
      maxItems: 4,
    });
    const expectedRevised = `\nShowing up to 4 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (4 items) was reached.\n\n${path.normalize('/testroot/manyFolders')}${path.sep}\n├───folder-0/\n├───folder-1/\n├───folder-2/\n├───folder-3/\n└───...\n`.trim();
    expect(structure.trim()).toBe(expectedRevised);
  });

  it('should handle maxItems that only allows the root folder itself', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/subfolderA'), {
      maxItems: 1,
    });
    const expectedRevisedMax1 = `\nShowing up to 1 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (1 items) was reached.\n\n${path.normalize('/testroot/subfolderA')}${path.sep}\n├───fileA1.ts\n├───...\n└───...\n`.trim();
    expect(structure.trim()).toBe(expectedRevisedMax1);
  });

  it('should handle non-existent directory', async () => {
    // Temporarily make fsPromises.readdir throw ENOENT for this specific path
    const originalReaddir = fsPromises.readdir;
    (fsPromises.readdir as Mock).mockImplementation(
      async (p: string | Buffer | URL) => {
        if (p === '/nonexistent') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        return originalReaddir(p);
      },
    );

    const structure = await getFolderStructure('/nonexistent');
    expect(structure).toContain(
      'Error: Could not read directory "/nonexistent". Check path and permissions.',
    );
  });

  it('should handle deep folder structure within limits', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/deepFolders'), {
      maxItems: 10,
    });
    const expected = `\nShowing up to 10 items (files + folders).\n\n${path.normalize('/testroot/deepFolders')}${path.sep}\n└───level1/\n    └───level2/\n        └───level3/\n            └───file.txt\n`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should truncate deep folder structure if maxItems is small', async () => {
    const structure = await getFolderStructure(path.normalize('/testroot/deepFolders'), {
      maxItems: 3,
    });
    const expected = `\nShowing up to 3 items (files + folders).\n\n${path.normalize('/testroot/deepFolders')}${path.sep}\n└───level1/\n    └───level2/\n        └───level3/\n`.trim();
    expect(structure.trim()).toBe(expected);
  });
});

describe('getFolderStructure gitignore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (path.resolve as Mock).mockImplementation((str: string) => str);

    (fsPromises.readdir as Mock).mockImplementation(async (p) => {
      const dirPath = p.toString();
      if (dirPath === path.normalize('/test/project')) {
        return [
          createDirent('file1.txt', 'file'),
          createDirent('node_modules', 'dir'),
          createDirent('ignored.txt', 'file'),
          createDirent('.gemini', 'dir'),
        ] as any;
      }
      if (dirPath === path.normalize('/test/project/node_modules')) {
        return [createDirent('some-package', 'dir')] as any;
      }
      if (dirPath === path.normalize('/test/project/.gemini')) {
        return [
          createDirent('config.yaml', 'file'),
          createDirent('logs.json', 'file'),
        ] as any;
      }
      return [];
    });

    (fs.readFileSync as Mock).mockImplementation((p) => {
      const filePath = p.toString();
      if (filePath === path.normalize('/test/project/.gitignore')) {
        return 'ignored.txt\nnode_modules/\n.gemini/\n!/.gemini/config.yaml';
      }
      return '';
    });

    vi.mocked(gitUtils.isGitRepository).mockReturnValue(true);
  });

  it('should ignore files and folders specified in .gitignore', async () => {
    const fileService = new FileDiscoveryService(path.normalize('/test/project'));
    const structure = await getFolderStructure(path.normalize('/test/project'), {
      fileService,
    });
    expect(structure).not.toContain('ignored.txt');
    expect(structure).toContain('node_modules/...');
    expect(structure).not.toContain('logs.json');
  });

  it('should not ignore files if respectGitIgnore is false', async () => {
    const fileService = new FileDiscoveryService(path.normalize('/test/project'));
    const structure = await getFolderStructure(path.normalize('/test/project'), {
      fileService,
      respectGitIgnore: false,
    });
    expect(structure).toContain('ignored.txt');
    // node_modules is still ignored by default
    expect(structure).toContain('node_modules/...');
  });
});

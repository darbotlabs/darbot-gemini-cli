/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PathNormalizer, normalizePath, joinPaths } from './pathNormalizer.js';
import * as os from 'os';

describe('PathNormalizer', () => {
  beforeEach(() => {
    // Reset any mocks
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalize', () => {
    it('should normalize basic paths', () => {
      expect(PathNormalizer.normalize('foo/bar')).toBe('foo/bar');
      expect(PathNormalizer.normalize('foo\\bar')).toBe('foo/bar');
      expect(PathNormalizer.normalize('foo//bar')).toBe('foo/bar');
    });

    it('should handle empty and invalid paths', () => {
      expect(PathNormalizer.normalize('')).toBe('');
      expect(PathNormalizer.normalize('.')).toBe('.');
      expect(PathNormalizer.normalize('..')).toBe('..');
    });

    it('should remove trailing slashes except for root', () => {
      expect(PathNormalizer.normalize('foo/bar/')).toBe('foo/bar');
      expect(PathNormalizer.normalize('foo/bar//')).toBe('foo/bar');
      expect(PathNormalizer.normalize('/')).toBe('/');
    });

    it('should resolve relative path segments', () => {
      expect(PathNormalizer.normalize('foo/../bar')).toBe('bar');
      expect(PathNormalizer.normalize('foo/./bar')).toBe('foo/bar');
      expect(PathNormalizer.normalize('./foo/bar')).toBe('foo/bar');
    });
  });

  describe('toPosix', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(PathNormalizer.toPosix('foo\\bar\\baz')).toBe('foo/bar/baz');
      expect(PathNormalizer.toPosix('C:\\Users\\test')).toBe('C:/Users/test');
    });

    it('should leave forward slashes unchanged', () => {
      expect(PathNormalizer.toPosix('foo/bar/baz')).toBe('foo/bar/baz');
    });
  });

  describe('toNative', () => {
    it('should convert to platform-specific separators', () => {
      const mockPlatform = vi.spyOn(process, 'platform', 'get');

      // Test Windows behavior
      mockPlatform.mockReturnValue('win32');
      expect(PathNormalizer.toNative('foo/bar/baz')).toBe('foo\\bar\\baz');

      // Test Unix behavior
      mockPlatform.mockReturnValue('darwin');
      expect(PathNormalizer.toNative('foo\\bar\\baz')).toBe('foo/bar/baz');
    });
  });

  describe('join', () => {
    it('should join path segments with forward slashes', () => {
      expect(PathNormalizer.join('foo', 'bar', 'baz')).toBe('foo/bar/baz');
      expect(PathNormalizer.join('foo/', '/bar', 'baz')).toBe('foo/bar/baz');
    });

    it('should handle empty segments', () => {
      expect(PathNormalizer.join('foo', '', 'bar')).toBe('foo/bar');
      expect(PathNormalizer.join('', 'foo', 'bar')).toBe('foo/bar');
      expect(PathNormalizer.join()).toBe('');
    });

    it('should normalize joined paths', () => {
      expect(PathNormalizer.join('foo', '../bar')).toBe('bar');
      expect(PathNormalizer.join('foo', './bar')).toBe('foo/bar');
    });
  });

  describe('relative', () => {
    it('should compute relative paths correctly', () => {
      expect(PathNormalizer.relative('/foo/bar', '/foo/baz')).toBe('../baz');
      expect(PathNormalizer.relative('/foo', '/foo/bar')).toBe('bar');
      expect(PathNormalizer.relative('/foo/bar', '/foo')).toBe('..');
    });

    it('should handle same paths', () => {
      expect(PathNormalizer.relative('/foo/bar', '/foo/bar')).toBe('');
    });
  });

  describe('areEqual', () => {
    it('should compare paths correctly on case-sensitive systems', () => {
      const mockPlatform = vi.spyOn(process, 'platform', 'get');
      mockPlatform.mockReturnValue('darwin'); // Unix-like system

      expect(PathNormalizer.areEqual('/foo/bar', '/foo/bar')).toBe(true);
      expect(PathNormalizer.areEqual('/foo/bar', '/Foo/Bar')).toBe(false);
      expect(PathNormalizer.areEqual('foo\\bar', 'foo/bar')).toBe(true);
    });

    it('should compare paths correctly on case-insensitive systems', () => {
      const mockPlatform = vi.spyOn(process, 'platform', 'get');
      mockPlatform.mockReturnValue('win32');

      expect(PathNormalizer.areEqual('C:\\foo\\bar', 'C:/foo/bar')).toBe(true);
      expect(PathNormalizer.areEqual('C:\\Foo\\Bar', 'c:/foo/bar')).toBe(true);
    });
  });

  describe('isSafe', () => {
    it('should detect safe paths', () => {
      expect(PathNormalizer.isSafe('foo/bar')).toBe(true);
      expect(PathNormalizer.isSafe('/absolute/path')).toBe(true);
      expect(PathNormalizer.isSafe('./relative/path')).toBe(true);
    });

    it('should detect unsafe directory traversal', () => {
      expect(PathNormalizer.isSafe('../../../etc/passwd')).toBe(false);
      expect(PathNormalizer.isSafe('foo/../../../etc')).toBe(false);
      expect(PathNormalizer.isSafe('foo\\..\\..\\etc')).toBe(false);
    });
  });

  describe('toWebSafe', () => {
    it('should create web-safe paths', () => {
      expect(PathNormalizer.toWebSafe('foo bar/baz')).toBe('foo%20bar/baz');
      expect(PathNormalizer.toWebSafe('foo\\bar')).toBe('foo/bar');
    });
  });

  describe('convenience functions', () => {
    it('normalizePath should work as alias', () => {
      expect(normalizePath('foo\\bar')).toBe('foo/bar');
    });

    it('joinPaths should work as alias', () => {
      expect(joinPaths('foo', 'bar')).toBe('foo/bar');
    });
  });

  describe('cross-platform scenarios', () => {
    it('should handle Windows absolute paths', () => {
      expect(PathNormalizer.normalize('C:\\Users\\test')).toBe('C:/Users/test');
      expect(PathNormalizer.isAbsolute('C:\\Users\\test')).toBe(true);
    });

    it('should handle Unix absolute paths', () => {
      expect(PathNormalizer.normalize('/home/test')).toBe('/home/test');
      expect(PathNormalizer.isAbsolute('/home/test')).toBe(true);
    });

    it('should handle mixed separators', () => {
      expect(PathNormalizer.normalize('foo\\bar/baz\\qux')).toBe(
        'foo/bar/baz/qux',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long paths', () => {
      const longPath = 'a/'.repeat(100) + 'file.txt';
      const normalized = PathNormalizer.normalize(longPath);
      expect(normalized).toContain('file.txt');
      expect(normalized.split('/').length).toBeGreaterThan(50);
    });

    it('should handle paths with special characters', () => {
      expect(PathNormalizer.normalize('foo-bar_baz.test')).toBe(
        'foo-bar_baz.test',
      );
      expect(PathNormalizer.normalize('foo (1)/bar [test]')).toBe(
        'foo (1)/bar [test]',
      );
    });

    it('should handle root paths correctly', () => {
      expect(PathNormalizer.normalize('/')).toBe('/');
      expect(PathNormalizer.normalize('\\')).toBe('/');
      expect(PathNormalizer.normalize('///')).toBe('/');
    });
  });
});

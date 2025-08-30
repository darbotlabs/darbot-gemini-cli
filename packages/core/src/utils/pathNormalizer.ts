/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve, normalize, isAbsolute, posix } from 'path';
import { platform } from 'os';

/**
 * Universal path normalization utility for cross-platform compatibility.
 * Handles Windows/Unix path differences and provides consistent path handling
 * across the DG-CLI codebase, especially important for testing environments.
 */
export class PathNormalizer {
  private static readonly isWindows = platform() === 'win32';

  /**
   * Normalizes a path to use forward slashes and resolve relative segments.
   * Ensures consistent path representation across all platforms.
   */
  static normalize(path: string): string {
    if (!path) return '';

    // Normalize the path using Node's built-in normalizer
    let normalized = normalize(path);

    // Convert backslashes to forward slashes for consistency
    normalized = normalized.replace(/\\/g, '/');

    // Remove trailing slashes except for root paths
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Resolves a path to an absolute path with normalization.
   * Always returns paths with forward slashes.
   */
  static resolve(...paths: string[]): string {
    const resolved = resolve(...paths);
    return this.normalize(resolved);
  }

  /**
   * Converts a path to use POSIX-style separators (forward slashes).
   * Useful for consistent path handling in tests and cross-platform scenarios.
   */
  static toPosix(path: string): string {
    return path.replace(/\\/g, '/');
  }

  /**
   * Converts a path to use platform-specific separators.
   * Useful when interfacing with OS-specific APIs that expect native paths.
   */
  static toNative(path: string): string {
    return this.isWindows ? path.replace(/\//g, '\\') : path;
  }

  /**
   * Joins path segments and normalizes the result.
   * Always returns normalized paths with forward slashes.
   */
  static join(...paths: string[]): string {
    // Filter out empty strings and normalize each segment
    const validPaths = paths.filter((p) => p && p.trim());
    if (validPaths.length === 0) return '';

    // Use posix.join for consistent forward slash behavior
    const joined = posix.join(...validPaths.map((p) => this.toPosix(p)));
    return this.normalize(joined);
  }

  /**
   * Checks if a path is absolute, accounting for Windows drive letters.
   */
  static isAbsolute(path: string): boolean {
    return isAbsolute(path);
  }

  /**
   * Gets the relative path from 'from' to 'to', normalized.
   * Result always uses forward slashes.
   */
  static relative(from: string, to: string): string {
    const normalizedFrom = this.normalize(from);
    const normalizedTo = this.normalize(to);

    // Use posix.relative for consistent behavior
    const relative = posix.relative(
      this.toPosix(normalizedFrom),
      this.toPosix(normalizedTo),
    );

    return this.normalize(relative);
  }

  /**
   * Checks if two paths are equivalent after normalization.
   * Handles case sensitivity based on platform.
   */
  static areEqual(path1: string, path2: string): boolean {
    const norm1 = this.normalize(path1);
    const norm2 = this.normalize(path2);

    // Windows paths are case-insensitive
    if (this.isWindows) {
      return norm1.toLowerCase() === norm2.toLowerCase();
    }

    return norm1 === norm2;
  }

  /**
   * Ensures a path uses the correct separator for the current platform.
   * This is useful for display purposes or when paths need to be platform-native.
   */
  static ensurePlatformSeparator(path: string): string {
    const normalized = this.normalize(path);
    return this.toNative(normalized);
  }

  /**
   * Creates a path that's safe for use in URLs or web contexts.
   * Always uses forward slashes and encodes special characters.
   */
  static toWebSafe(path: string): string {
    const normalized = this.normalize(path);
    return encodeURI(normalized);
  }

  /**
   * Validates that a path doesn't contain dangerous traversal patterns.
   * Returns true if the path is safe, false if it contains potential security risks.
   */
  static isSafe(path: string): boolean {
    const normalized = this.normalize(path);

    // Check for directory traversal attempts
    if (normalized.includes('../') || normalized.includes('..\\')) {
      return false;
    }

    // Check for absolute paths that might escape intended directories
    if (this.isAbsolute(normalized)) {
      // Allow absolute paths but be cautious
      return true;
    }

    return true;
  }
}

/**
 * Convenience function for quick path normalization.
 * Equivalent to PathNormalizer.normalize().
 */
export function normalizePath(path: string): string {
  return PathNormalizer.normalize(path);
}

/**
 * Convenience function for joining and normalizing paths.
 * Equivalent to PathNormalizer.join().
 */
export function joinPaths(...paths: string[]): string {
  return PathNormalizer.join(...paths);
}

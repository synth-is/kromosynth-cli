import { SQLitePersistenceProvider } from '../../util/sqlite-persistence-provider.js';

/**
 * NodePersistenceProvider extends SQLitePersistenceProvider for Node.js environment
 * It uses SQLite for genomes and features when available, with file-based fallback
 */
export class NodePersistenceProvider extends SQLitePersistenceProvider {
  // All methods are inherited from SQLitePersistenceProvider
}
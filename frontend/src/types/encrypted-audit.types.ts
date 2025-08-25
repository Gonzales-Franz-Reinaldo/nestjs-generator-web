export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  charset?: string;
  timezone?: string;
}

export interface EncryptedAuditTable {
  table_name: string;
  schema_name: string;
}

export interface EncryptedRecord {
  id: number;
  encrypted_table_name: string;
  encrypted_column_names: string;
  encrypted_data_chunk_1: string;
  encrypted_data_chunk_2: string;
  encrypted_data_chunk_3: string;
  encrypted_data_chunk_4: string;
  encrypted_data_chunk_5: string;
  created_at: string;
  record_hash: string;
  encryption_version: string;
}

export interface DecryptedRecord {
  id: number;
  tableName: string;
  columnNames: string[];
  auditData: {
    tableName: string;
    tableStructure: any[];
    record: any;
    timestamp: string;
    operation: string;
    user: string;
    ip: string;
    userAgent: string;
  };
  createdAt: string;
  encryptionVersion: string;
  error?: string;
}

export interface MigrationResult {
  tableName: string;
  status: 'success' | 'error';
  migratedRecords?: number;
  error?: string;
}

export interface AuditStats {
  total_records: number;
  first_record: string;
  last_record: string;
  encryption_versions: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  count?: number;
  summary?: {
    total: number;
    successful: number;
    errors: number;
  };
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
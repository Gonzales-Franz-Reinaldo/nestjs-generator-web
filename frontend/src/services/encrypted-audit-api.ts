// import { api } from './api';

// import type {
//   DatabaseConfig,
//   EncryptedAuditTable,
//   EncryptedRecord,
//   DecryptedRecord,
//   MigrationResult,
//   AuditStats,
//   ApiResponse
// } from '../types/encrypted-audit.types';

// export class EncryptedAuditAPI {
//   private static baseUrl = '/api/encrypted-audit';

//   /**
//    * Migrar tablas de auditoría a formato encriptado
//    */
//   static async migrateToEncrypted(
//     dbConfig: DatabaseConfig,
//     dbType: 'postgresql' | 'mysql',
//     encryptionKey: string
//   ): Promise<ApiResponse<MigrationResult[]>> {
//     const response = await api.post(`${this.baseUrl}/migrate`, {
//       dbConfig,
//       dbType,
//       encryptionKey
//     });
//     return response.data;
//   }

//   /**
//    * Listar tablas de auditoría encriptadas
//    */
//   static async listEncryptedTables(
//     dbConfig: DatabaseConfig,
//     dbType: 'postgresql' | 'mysql'
//   ): Promise<ApiResponse<EncryptedAuditTable[]>> {
//     const response = await api.post(`${this.baseUrl}/tables`, {
//       dbConfig,
//       dbType
//     });
//     return response.data;
//   }

//   /**
//    * Obtener registros encriptados (sin desencriptar)
//    */
//   static async getEncryptedRecords(
//     dbConfig: DatabaseConfig,
//     dbType: 'postgresql' | 'mysql',
//     tableName: string,
//     limit: number = 50,
//     offset: number = 0
//   ): Promise<ApiResponse<EncryptedRecord[]>> {
//     const response = await api.post(`${this.baseUrl}/records`, {
//       dbConfig,
//       dbType,
//       tableName,
//       limit,
//       offset
//     });
//     return response.data;
//   }

//   /**
//    * Desencriptar registros específicos
//    */
//   static async decryptRecords(
//     dbConfig: DatabaseConfig,
//     dbType: 'postgresql' | 'mysql',
//     tableName: string,
//     encryptionKey: string,
//     recordIds: number[] = [],
//     limit: number = 50
//   ): Promise<ApiResponse<DecryptedRecord[]>> {
//     const response = await api.post(`${this.baseUrl}/decrypt`, {
//       dbConfig,
//       dbType,
//       tableName,
//       encryptionKey,
//       recordIds,
//       limit
//     });
//     return response.data;
//   }

//   /**
//    * Validar clave de encriptación
//    */
//   static async validateEncryptionKey(
//     dbConfig: DatabaseConfig,
//     dbType: 'postgresql' | 'mysql',
//     tableName: string,
//     encryptionKey: string
//   ): Promise<ApiResponse<boolean>> {
//     const response = await api.post(`${this.baseUrl}/validate-key`, {
//       dbConfig,
//       dbType,
//       tableName,
//       encryptionKey
//     });
//     return response.data;
//   }

//   /**
//    * Obtener estadísticas de tabla encriptada
//    */
//   static async getStats(
//     dbConfig: DatabaseConfig,
//     dbType: 'postgresql' | 'mysql',
//     tableName: string
//   ): Promise<ApiResponse<AuditStats>> {
//     const response = await api.post(`${this.baseUrl}/stats`, {
//       dbConfig,
//       dbType,
//       tableName
//     });
//     return response.data;
//   }
// }
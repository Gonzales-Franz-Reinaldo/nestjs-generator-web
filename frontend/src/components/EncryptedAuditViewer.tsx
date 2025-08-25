// import React, { useState, useEffect } from 'react';
// import { DatabaseSelector } from './DatabaseSelector';
// import { DatabaseConfig } from './DatabaseConfig';
// import { EncryptedTableList } from './EncryptedTableList';
// import { DecryptionDialog } from './DecryptionDialog';
// import { AuditRecordsTable } from './AuditRecordsTable';
// import { EncryptedAuditAPI } from '../services/encrypted-audit-api';
// import type { 
//   DatabaseConfig as DbConfig,
//   EncryptedAuditTable,
//   EncryptedRecord,
//   DecryptedRecord
// } from '../types/encrypted-audit.types';

// export const EncryptedAuditViewer: React.FC = () => {
//   const [step, setStep] = useState<'database' | 'config' | 'tables' | 'records'>('database');
//   const [dbType, setDbType] = useState<'postgresql' | 'mysql'>('postgresql');
//   const [dbConfig, setDbConfig] = useState<DbConfig | null>(null);
//   const [tables, setTables] = useState<EncryptedAuditTable[]>([]);
//   const [selectedTable, setSelectedTable] = useState<string>('');
//   const [encryptedRecords, setEncryptedRecords] = useState<EncryptedRecord[]>([]);
//   const [decryptedRecords, setDecryptedRecords] = useState<DecryptedRecord[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string>('');
//   const [showMigration, setShowMigration] = useState(false);
//   const [showDecryption, setShowDecryption] = useState(false);

//   // Cargar tablas encriptadas
//   const loadEncryptedTables = async () => {
//     if (!dbConfig) return;

//     setLoading(true);
//     setError('');

//     try {
//       const response = await EncryptedAuditAPI.listEncryptedTables(dbConfig, dbType);
      
//       if (response.success && response.data) {
//         setTables(response.data);
//         setStep('tables');
//       } else {
//         setError(response.message || 'Error cargando tablas');
//       }
//     } catch (err) {
//       setError('Error de conexión al servidor');
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Cargar registros encriptados
//   const loadEncryptedRecords = async (tableName: string) => {
//     if (!dbConfig) return;

//     setLoading(true);
//     setError('');
//     setSelectedTable(tableName);

//     try {
//       const response = await EncryptedAuditAPI.getEncryptedRecords(
//         dbConfig, 
//         dbType, 
//         tableName,
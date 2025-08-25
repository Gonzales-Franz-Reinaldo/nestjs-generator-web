// import React, { useState, useEffect } from 'react';
// import type { EncryptedAuditTable, AuditStats } from '../types/encrypted-audit.types';

// interface EncryptedTableListProps {
//   tables: EncryptedAuditTable[];
//   onSelectTable: (tableName: string) => void;
//   selectedTable: string;
//   loading: boolean;
//   dbType: 'postgresql' | 'mysql';
//   onRefresh: () => void;
//   onGetStats?: (tableName: string) => Promise<AuditStats | null>;
// }

// export const EncryptedTableList: React.FC<EncryptedTableListProps> = ({
//   tables,
//   onSelectTable,
//   selectedTable,
//   loading,
//   dbType,
//   onRefresh,
//   onGetStats
// }) => {
//   const [tableStats, setTableStats] = useState<Record<string, AuditStats>>({});
//   const [loadingStats, setLoadingStats] = useState<Record<string, boolean>>({});
//   const [searchTerm, setSearchTerm] = useState('');
//   const [sortBy, setSortBy] = useState<'name' | 'records'>('name');

//   // Filtrar tablas por búsqueda
//   const filteredTables = tables.filter(table =>
//     table.table_name.toLowerCase().includes(searchTerm.toLowerCase())
//   );

//   // Ordenar tablas
//   const sortedTables = [...filteredTables].sort((a, b) => {
//     if (sortBy === 'name') {
//       return a.table_name.localeCompare(b.table_name);
//     } else {
//       const statsA = tableStats[a.table_name];
//       const statsB = tableStats[b.table_name];
//       const recordsA = statsA?.total_records || 0;
//       const recordsB = statsB?.total_records || 0;
//       return recordsB - recordsA;
//     }
//   });

//   // Cargar estadísticas para una tabla
//   const loadTableStats = async (tableName: string) => {
//     if (!onGetStats || loadingStats[tableName]) return;

//     setLoadingStats(prev => ({ ...prev, [tableName]: true }));

//     try {
//       const stats = await onGetStats(tableName);
//       if (stats) {
//         setTableStats(prev => ({ ...prev, [tableName]: stats }));
//       }
//     } catch (error) {
//       console.error(`Error loading stats for ${tableName}:`, error);
//     } finally {
//       setLoadingStats(prev => ({ ...prev, [tableName]: false }));
//     }
//   };

//   // Formatear tamaño de bytes
//   const formatBytes = (bytes: number) => {
//     if (bytes === 0) return '0 B';
//     const k = 1024;
//     const sizes = ['B', 'KB', 'MB', 'GB'];
//     const i = Math.floor(Math.log(bytes) / Math.log(k));
//     return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
//   };

//   // Formatear fecha
//   const formatDate = (dateString: string) => {
//     return new Date(dateString).toLocaleDateString('es-ES', {
//       year: 'numeric',
//       month: 'short',
//       day: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit'
//     });
//   };

//   return (
//     <div className="bg-white rounded-lg shadow">
//       {/* Header */}
//       <div className="px-6 py-4 border-b border-gray-200">
//         <div className="flex items-center justify-between">
//           <div>
//             <h3 className="text-lg font-medium text-gray-900">
//               🔒 Tablas de Auditoría Encriptadas
//             </h3>
//             <p className="mt-1 text-sm text-gray-500">
//               {tables.length} tabla{tables.length !== 1 ? 's' : ''} encontrada{tables.length !== 1 ? 's' : ''} en {dbType.toUpperCase()}
//             </p>
//           </div>
          
//           <div className="flex items-center space-x-3">
//             <button
//               onClick={onRefresh}
//               disabled={loading}
//               className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
//             >
//               <svg className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
//               </svg>
//               Actualizar
//             </button>
//           </div>
//         </div>

//         {/* Controles de búsqueda y ordenamiento */}
//         <div className="mt-4 flex items-center space-x-4">
//           <div className="flex-1">
//             <label htmlFor="search" className="sr-only">Buscar tablas</label>
//             <div className="relative">
//               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//                 <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
//                 </svg>
//               </div>
//               <input
//                 type="text"
//                 id="search"
//                 className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
//                 placeholder="Buscar tablas..."
//                 value={searchTerm}
//                 onChange={(e) => setSearchTerm(e.target.value)}
//               />
//             </div>
//           </div>

//           <div>
//             <label htmlFor="sort" className="sr-only">Ordenar por</label>
//             <select
//               id="sort"
//               className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
//               value={sortBy}
//               // filepath: c:\workspace\SHC134\nestjs-automation\nestjs-generator-web\frontend\src\components\EncryptedTableList.tsx
// import React, { useState, useEffect } from 'react';
// import type { EncryptedAuditTable, AuditStats } from '../types/encrypted-audit.types';

// interface EncryptedTableListProps {
//   tables: EncryptedAuditTable[];
//   onSelectTable: (tableName: string) => void;
//   selectedTable: string;
//   loading: boolean;
//   dbType: 'postgresql' | 'mysql';
//   onRefresh: () => void;
//   onGetStats?: (tableName: string) => Promise<AuditStats | null>;
// }

// export const EncryptedTableList: React.FC<EncryptedTableListProps> = ({
//   tables,
//   onSelectTable,
//   selectedTable,
//   loading,
//   dbType,
//   onRefresh,
//   onGetStats
// }) => {
//   const [tableStats, setTableStats] = useState<Record<string, AuditStats>>({});
//   const [loadingStats, setLoadingStats] = useState<Record<string, boolean>>({});
//   const [searchTerm, setSearchTerm] = useState('');
//   const [sortBy, setSortBy] = useState<'name' | 'records'>('name');

//   // Filtrar tablas por búsqueda
//   const filteredTables = tables.filter(table =>
//     table.table_name.toLowerCase().includes(searchTerm.toLowerCase())
//   );

//   // Ordenar tablas
//   const sortedTables = [...filteredTables].sort((a, b) => {
//     if (sortBy === 'name') {
//       return a.table_name.localeCompare(b.table_name);
//     } else {
//       const statsA = tableStats[a.table_name];
//       const statsB = tableStats[b.table_name];
//       const recordsA = statsA?.total_records || 0;
//       const recordsB = statsB?.total_records || 0;
//       return recordsB - recordsA;
//     }
//   });

//   // Cargar estadísticas para una tabla
//   const loadTableStats = async (tableName: string) => {
//     if (!onGetStats || loadingStats[tableName]) return;

//     setLoadingStats(prev => ({ ...prev, [tableName]: true }));

//     try {
//       const stats = await onGetStats(tableName);
//       if (stats) {
//         setTableStats(prev => ({ ...prev, [tableName]: stats }));
//       }
//     } catch (error) {
//       console.error(`Error loading stats for ${tableName}:`, error);
//     } finally {
//       setLoadingStats(prev => ({ ...prev, [tableName]: false }));
//     }
//   };

//   // Formatear tamaño de bytes
//   const formatBytes = (bytes: number) => {
//     if (bytes === 0) return '0 B';
//     const k = 1024;
//     const sizes = ['B', 'KB', 'MB', 'GB'];
//     const i = Math.floor(Math.log(bytes) / Math.log(k));
//     return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
//   };

//   // Formatear fecha
//   const formatDate = (dateString: string) => {
//     return new Date(dateString).toLocaleDateString('es-ES', {
//       year: 'numeric',
//       month: 'short',
//       day: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit'
//     });
//   };

//   return (
//     <div className="bg-white rounded-lg shadow">
//       {/* Header */}
//       <div className="px-6 py-4 border-b border-gray-200">
//         <div className="flex items-center justify-between">
//           <div>
//             <h3 className="text-lg font-medium text-gray-900">
//               🔒 Tablas de Auditoría Encriptadas
//             </h3>
//             <p className="mt-1 text-sm text-gray-500">
//               {tables.length} tabla{tables.length !== 1 ? 's' : ''} encontrada{tables.length !== 1 ? 's' : ''} en {dbType.toUpperCase()}
//             </p>
//           </div>
          
//           <div className="flex items-center space-x-3">
//             <button
//               onClick={onRefresh}
//               disabled={loading}
//               className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
//             >
//               <svg className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
//               </svg>
//               Actualizar
//             </button>
//           </div>
//         </div>

//         {/* Controles de búsqueda y ordenamiento */}
//         <div className="mt-4 flex items-center space-x-4">
//           <div className="flex-1">
//             <label htmlFor="search" className="sr-only">Buscar tablas</label>
//             <div className="relative">
//               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//                 <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
//                 </svg>
//               </div>
//               <input
//                 type="text"
//                 id="search"
//                 className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
//                 placeholder="Buscar tablas..."
//                 value={searchTerm}
//                 onChange={(e) => setSearchTerm(e.target.value)}
//               />
//             </div>
//           </div>

//           <div>
//             <label htmlFor="sort" className="sr-only">Ordenar por</label>
//             <select
//               id="sort"
//               className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
//               value=
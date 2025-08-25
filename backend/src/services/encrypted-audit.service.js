const EncryptionService = require('./encryption.service');
const { Client } = require('pg');
const mysql = require('mysql2/promise');

class EncryptedAuditService {
    constructor() {
        this.encryption = new EncryptionService();
        this.encryptedTablePrefix = 'aud_enc_';
    }

    /**
     * Obtener conexión a base de datos
     */
    async getConnection(dbConfig, dbType) {
        if (dbType === 'postgresql') {
            const client = new Client(dbConfig);
            await client.connect();
            return client;
        } else if (dbType === 'mysql') {
            return await mysql.createConnection(dbConfig);
        }
        throw new Error('Tipo de base de datos no soportado');
    }

    /**
     * Migrar tablas de auditoría existentes a formato encriptado
     */
    async migrateToEncryptedAudit(dbConfig, dbType, encryptionKey) {
        console.log('🔄 Iniciando migración a auditoría encriptada...');
        
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            // Obtener todas las tablas de auditoría existentes
            const auditTables = await this.getExistingAuditTables(connection, dbConfig, dbType);
            
            console.log(`📋 Encontradas ${auditTables.length} tablas de auditoría para migrar`);
            
            const migrationResults = [];
            
            for (const tableName of auditTables) {
                try {
                    console.log(`🔧 Migrando tabla: ${tableName}`);
                    
                    // Crear tabla encriptada
                    await this.createEncryptedAuditTable(connection, tableName, dbType, dbConfig.database);
                    
                    // Migrar datos existentes
                    const migratedCount = await this.migrateAuditData(
                        connection, tableName, encryptionKey, dbType, dbConfig.database
                    );
                    
                    migrationResults.push({
                        tableName,
                        status: 'success',
                        migratedRecords: migratedCount
                    });
                    
                    console.log(`✅ ${tableName}: ${migratedCount} registros migrados`);
                    
                } catch (error) {
                    console.error(`❌ Error migrando ${tableName}:`, error.message);
                    migrationResults.push({
                        tableName,
                        status: 'error',
                        error: error.message
                    });
                }
            }
            
            return migrationResults;
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }

    /**
     * Obtener tablas de auditoría existentes
     */
    async getExistingAuditTables(connection, dbConfig, dbType) {
        let result;
        
        if (dbType === 'postgresql') {
            result = await connection.query(`
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public' 
                AND tablename LIKE 'aud_%'
                AND tablename NOT LIKE 'aud_enc_%'
                ORDER BY tablename
            `);
            return result.rows.map(row => row.tablename);
        } else {
            result = await connection.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = ? 
                AND table_name LIKE 'aud_%'
                AND table_name NOT LIKE 'aud_enc_%'
                ORDER BY table_name
            `, [dbConfig.database]);
            return result[0].map(row => row.table_name);
        }
    }

    /**
     * Crear tabla de auditoría encriptada
     */
    async createEncryptedAuditTable(connection, originalAuditTable, dbType, database) {
        const encryptedTableName = originalAuditTable.replace('aud_', this.encryptedTablePrefix);
        
        // Eliminar tabla encriptada si existe
        if (dbType === 'postgresql') {
            await connection.query(`DROP TABLE IF EXISTS ${encryptedTableName}`);
            
            // Crear nueva tabla encriptada con estructura genérica
            await connection.query(`
                CREATE TABLE ${encryptedTableName} (
                    id SERIAL PRIMARY KEY,
                    encrypted_table_name TEXT,
                    encrypted_column_names TEXT,
                    encrypted_data_chunk_1 TEXT,
                    encrypted_data_chunk_2 TEXT,
                    encrypted_data_chunk_3 TEXT,
                    encrypted_data_chunk_4 TEXT,
                    encrypted_data_chunk_5 TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    record_hash VARCHAR(64),
                    encryption_version VARCHAR(10) DEFAULT '1.0'
                )
            `);
        } else {
            await connection.query(`DROP TABLE IF EXISTS ${database}.${encryptedTableName}`);
            
            await connection.query(`
                CREATE TABLE ${database}.${encryptedTableName} (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    encrypted_table_name TEXT,
                    encrypted_column_names TEXT,
                    encrypted_data_chunk_1 TEXT,
                    encrypted_data_chunk_2 TEXT,
                    encrypted_data_chunk_3 TEXT,
                    encrypted_data_chunk_4 TEXT,
                    encrypted_data_chunk_5 TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    record_hash VARCHAR(64),
                    encryption_version VARCHAR(10) DEFAULT '1.0'
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
        }
        
        // Crear índices
        const indexQueries = [
            `CREATE INDEX idx_${encryptedTableName}_created ON ${encryptedTableName} (created_at)`,
            `CREATE INDEX idx_${encryptedTableName}_hash ON ${encryptedTableName} (record_hash)`,
            `CREATE INDEX idx_${encryptedTableName}_version ON ${encryptedTableName} (encryption_version)`
        ];
        
        for (const indexQuery of indexQueries) {
            try {
                await connection.query(indexQuery);
            } catch (error) {
                // Ignorar errores de índices duplicados
            }
        }
    }

    /**
     * Migrar datos de auditoría existentes a formato encriptado
     */
    async migrateAuditData(connection, auditTableName, encryptionKey, dbType, database) {
        // Obtener estructura de la tabla original
        const tableStructure = await this.getTableStructure(connection, auditTableName, dbType, database);
        
        // Obtener todos los registros de la tabla de auditoría
        let auditRecords;
        
        if (dbType === 'postgresql') {
            const result = await connection.query(`SELECT * FROM ${auditTableName} ORDER BY id_auditoria`);
            auditRecords = result.rows;
        } else {
            const result = await connection.query(`SELECT * FROM ${database}.${auditTableName} ORDER BY id_auditoria`);
            auditRecords = result[0];
        }
        
        console.log(`📊 Migrando ${auditRecords.length} registros de ${auditTableName}...`);
        
        const encryptedTableName = auditTableName.replace('aud_', this.encryptedTablePrefix);
        let migratedCount = 0;
        
        // Procesar registros en lotes
        const batchSize = 100;
        for (let i = 0; i < auditRecords.length; i += batchSize) {
            const batch = auditRecords.slice(i, i + batchSize);
            
            for (const record of batch) {
                try {
                    // Preparar datos para encriptación
                    const auditData = {
                        tableName: auditTableName.replace('aud_', ''),
                        tableStructure: tableStructure,
                        record: record,
                        timestamp: record.fecha_accion || new Date(),
                        operation: record.accion_sql || 'Unknown',
                        user: record.usuario_accion || 'System',
                        ip: record.ip_address || '127.0.0.1',
                        userAgent: record.user_agent || 'System'
                    };
                    
                    // Encriptar datos
                    const encryptedRecord = await this.encryptAuditRecord(auditData, encryptionKey);
                    
                    // Insertar en tabla encriptada
                    await this.insertEncryptedRecord(
                        connection, encryptedTableName, encryptedRecord, dbType, database
                    );
                    
                    migratedCount++;
                    
                } catch (error) {
                    console.error(`❌ Error migrando registro ${record.id_auditoria}:`, error.message);
                }
            }
            
            // Mostrar progreso
            console.log(`📈 Progreso: ${Math.min(i + batchSize, auditRecords.length)}/${auditRecords.length} registros procesados`);
        }
        
        return migratedCount;
    }

    /**
     * Obtener estructura de tabla
     */
    async getTableStructure(connection, tableName, dbType, database) {
        let result;
        
        if (dbType === 'postgresql') {
            result = await connection.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1 AND table_schema = 'public'
                ORDER BY ordinal_position
            `, [tableName]);
            return result.rows;
        } else {
            result = await connection.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = ? AND table_schema = ?
                ORDER BY ordinal_position
            `, [tableName, database]);
            return result[0];
        }
    }

    /**
     * Encriptar registro de auditoría completo
     */
    async encryptAuditRecord(auditData, encryptionKey) {
        // Encriptar nombre de tabla
        const encryptedTableName = this.encryption.encryptText(auditData.tableName, encryptionKey);
        
        // Encriptar nombres de columnas
        const columnNames = auditData.tableStructure.map(col => col.column_name);
        const encryptedColumnNames = this.encryption.encryptText(JSON.stringify(columnNames), encryptionKey);
        
        // Encriptar datos completos del registro
        const encryptedData = this.encryption.encrypt(auditData, encryptionKey);
        
        // Dividir datos encriptados en chunks
        const dataChunks = this.encryption.splitEncryptedData(encryptedData, 5);
        
        // Generar hash para integridad
        const recordHash = require('crypto')
            .createHash('sha256')
            .update(encryptedData)
            .digest('hex');
        
        return {
            encryptedTableName,
            encryptedColumnNames,
            dataChunks,
            recordHash
        };
    }

    /**
     * Insertar registro encriptado
     */
    async insertEncryptedRecord(connection, encryptedTableName, encryptedRecord, dbType, database) {
        const {
            encryptedTableName: tableName,
            encryptedColumnNames,
            dataChunks,
            recordHash
        } = encryptedRecord;
        
        if (dbType === 'postgresql') {
            await connection.query(`
                INSERT INTO ${encryptedTableName} (
                    encrypted_table_name, encrypted_column_names,
                    encrypted_data_chunk_1, encrypted_data_chunk_2, encrypted_data_chunk_3,
                    encrypted_data_chunk_4, encrypted_data_chunk_5, record_hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                tableName, encryptedColumnNames,
                dataChunks[0] || '', dataChunks[1] || '', dataChunks[2] || '',
                dataChunks[3] || '', dataChunks[4] || '', recordHash
            ]);
        } else {
            await connection.query(`
                INSERT INTO ${database}.${encryptedTableName} (
                    encrypted_table_name, encrypted_column_names,
                    encrypted_data_chunk_1, encrypted_data_chunk_2, encrypted_data_chunk_3,
                    encrypted_data_chunk_4, encrypted_data_chunk_5, record_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                tableName, encryptedColumnNames,
                dataChunks[0] || '', dataChunks[1] || '', dataChunks[2] || '',
                dataChunks[3] || '', dataChunks[4] || '', recordHash
            ]);
        }
    }

    /**
     * Listar tablas de auditoría encriptadas
     */
    async listEncryptedAuditTables(dbConfig, dbType) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            let result;
            
            if (dbType === 'postgresql') {
                result = await connection.query(`
                    SELECT 
                        tablename as table_name,
                        schemaname as schema_name
                    FROM pg_tables 
                    WHERE schemaname = 'public' 
                    AND tablename LIKE '${this.encryptedTablePrefix}%'
                    ORDER BY tablename
                `);
                return result.rows;
            } else {
                result = await connection.query(`
                    SELECT 
                        table_name,
                        table_schema as schema_name
                    FROM information_schema.tables 
                    WHERE table_schema = ? 
                    AND table_name LIKE ?
                    ORDER BY table_name
                `, [dbConfig.database, `${this.encryptedTablePrefix}%`]);
                return result[0];
            }
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }

    /**
     * Obtener registros encriptados (sin desencriptar)
     */
    async getEncryptedRecords(dbConfig, dbType, tableName, limit = 50, offset = 0) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            let result;
            
            if (dbType === 'postgresql') {
                result = await connection.query(`
                    SELECT 
                        id,
                        encrypted_table_name,
                        encrypted_column_names,
                        encrypted_data_chunk_1,
                        encrypted_data_chunk_2,
                        encrypted_data_chunk_3,
                        encrypted_data_chunk_4,
                        encrypted_data_chunk_5,
                        created_at,
                        record_hash,
                        encryption_version
                    FROM ${tableName}
                    ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
                `, [limit, offset]);
                return result.rows;
            } else {
                result = await connection.query(`
                    SELECT 
                        id,
                        encrypted_table_name,
                        encrypted_column_names,
                        encrypted_data_chunk_1,
                        encrypted_data_chunk_2,
                        encrypted_data_chunk_3,
                        encrypted_data_chunk_4,
                        encrypted_data_chunk_5,
                        created_at,
                        record_hash,
                        encryption_version
                    FROM ${dbConfig.database}.${tableName}
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                `, [limit, offset]);
                return result[0];
            }
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }

    /**
     * Desencriptar registros específicos
     */
    async decryptRecords(dbConfig, dbType, tableName, encryptionKey, recordIds = [], limit = 50) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            let records;
            
            if (recordIds.length > 0) {
                // Obtener registros específicos
                const placeholders = recordIds.map(() => '?').join(',');
                
                if (dbType === 'postgresql') {
                    const pgPlaceholders = recordIds.map((_, i) => `$${i + 1}`).join(',');
                    const result = await connection.query(`
                        SELECT * FROM ${tableName} WHERE id IN (${pgPlaceholders})
                    `, recordIds);
                    records = result.rows;
                } else {
                    const result = await connection.query(`
                        SELECT * FROM ${dbConfig.database}.${tableName} WHERE id IN (${placeholders})
                    `, recordIds);
                    records = result[0];
                }
            } else {
                // Obtener registros recientes
                if (dbType === 'postgresql') {
                    const result = await connection.query(`
                        SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT $1
                    `, [limit]);
                    records = result.rows;
                } else {
                    const result = await connection.query(`
                        SELECT * FROM ${dbConfig.database}.${tableName} ORDER BY created_at DESC LIMIT ?
                    `, [limit]);
                    records = result[0];
                }
            }
            
            // Desencriptar cada registro
            const decryptedRecords = [];
            
            for (const record of records) {
                try {
                    // Verificar integridad
                    const combinedData = this.encryption.combineEncryptedChunks([
                        record.encrypted_data_chunk_1,
                        record.encrypted_data_chunk_2,
                        record.encrypted_data_chunk_3,
                        record.encrypted_data_chunk_4,
                        record.encrypted_data_chunk_5
                    ]);
                    
                    const calculatedHash = require('crypto')
                        .createHash('sha256')
                        .update(combinedData)
                        .digest('hex');
                    
                    if (calculatedHash !== record.record_hash) {
                        throw new Error('Integridad de datos comprometida');
                    }
                    
                    // Desencriptar datos
                    const decryptedData = this.encryption.decrypt(combinedData, encryptionKey);
                    const decryptedTableName = this.encryption.decryptText(record.encrypted_table_name, encryptionKey);
                    const decryptedColumnNames = JSON.parse(this.encryption.decryptText(record.encrypted_column_names, encryptionKey));
                    
                    decryptedRecords.push({
                        id: record.id,
                        tableName: decryptedTableName,
                        columnNames: decryptedColumnNames,
                        auditData: decryptedData,
                        createdAt: record.created_at,
                        encryptionVersion: record.encryption_version
                    });
                    
                } catch (error) {
                    console.error(`❌ Error desencriptando registro ${record.id}:`, error.message);
                    
                    decryptedRecords.push({
                        id: record.id,
                        error: error.message,
                        createdAt: record.created_at
                    });
                }
            }
            
            return decryptedRecords;
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }

    /**
     * Validar clave de encriptación
     */
    async validateEncryptionKey(dbConfig, dbType, tableName, encryptionKey) {
        try {
            // Intentar desencriptar un registro de muestra
            const sampleRecords = await this.getEncryptedRecords(dbConfig, dbType, tableName, 1, 0);
            
            if (sampleRecords.length === 0) {
                return { valid: false, error: 'No hay registros para validar' };
            }
            
            const sampleRecord = sampleRecords[0];
            
            // Intentar desencriptar
            const combinedData = this.encryption.combineEncryptedChunks([
                sampleRecord.encrypted_data_chunk_1,
                sampleRecord.encrypted_data_chunk_2,
                sampleRecord.encrypted_data_chunk_3,
                sampleRecord.encrypted_data_chunk_4,
                sampleRecord.encrypted_data_chunk_5
            ]);
            
            this.encryption.decrypt(combinedData, encryptionKey);
            
            return { valid: true };
            
        } catch (error) {
            return { 
                valid: false, 
                error: 'Clave de encriptación incorrecta' 
            };
        }
    }

    /**
     * Obtener estadísticas de tablas encriptadas
     */
    async getEncryptedAuditStats(dbConfig, dbType, tableName) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            let result;
            
            if (dbType === 'postgresql') {
                result = await connection.query(`
                    SELECT 
                        COUNT(*) as total_records,
                        MIN(created_at) as first_record,
                        MAX(created_at) as last_record,
                        COUNT(DISTINCT encryption_version) as encryption_versions
                    FROM ${tableName}
                `);
                return result.rows[0];
            } else {
                result = await connection.query(`
                    SELECT 
                        COUNT(*) as total_records,
                        MIN(created_at) as first_record,
                        MAX(created_at) as last_record,
                        COUNT(DISTINCT encryption_version) as encryption_versions
                    FROM ${dbConfig.database}.${tableName}
                `);
                return result[0][0];
            }
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }

    /**
     * Procesar cola de encriptación (para procesamiento asíncrono)
     */
    async processEncryptionQueue(dbConfig, dbType, encryptionKey, batchSize = 10) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            // Obtener registros pendientes
            let pendingRecords;
            
            if (dbType === 'postgresql') {
                const result = await connection.query(`
                    SELECT * FROM encryption_queue 
                    WHERE status = 'pending' 
                    ORDER BY created_at 
                    LIMIT $1
                `, [batchSize]);
                pendingRecords = result.rows;
            } else {
                const result = await connection.query(`
                    SELECT * FROM ${dbConfig.database}.encryption_queue 
                    WHERE status = 'pending' 
                    ORDER BY created_at 
                    LIMIT ?
                `, [batchSize]);
                pendingRecords = result[0];
            }
            
            console.log(`📦 Procesando ${pendingRecords.length} registros de la cola...`);
            
            const processedResults = [];
            
            for (const queueRecord of pendingRecords) {
                try {
                    // Marcar como procesando
                    await this.updateQueueStatus(connection, queueRecord.id, 'processing', dbType, dbConfig.database);
                    
                    // Procesar registro
                    const recordData = typeof queueRecord.record_data === 'string' 
                        ? JSON.parse(queueRecord.record_data) 
                        : queueRecord.record_data;
                    
                    const auditData = {
                        tableName: queueRecord.source_table.replace('aud_', ''),
                        operation: queueRecord.operation,
                        record: recordData,
                        timestamp: queueRecord.created_at,
                        user: 'system',
                        ip: '127.0.0.1',
                        userAgent: 'EncryptionService',
                        tableStructure: await this.getTableStructure(connection, queueRecord.source_table, dbType, dbConfig.database)
                    };
                    
                    // Encriptar y guardar
                    const encryptedRecord = await this.encryptAuditRecord(auditData, encryptionKey);
                    const encryptedTableName = queueRecord.source_table.replace('aud_', this.encryptedTablePrefix);
                    
                    await this.insertEncryptedRecord(
                        connection, encryptedTableName, encryptedRecord, dbType, dbConfig.database
                    );
                    
                    // Marcar como completado
                    await this.updateQueueStatus(connection, queueRecord.id, 'completed', dbType, dbConfig.database);
                    
                    processedResults.push({
                        id: queueRecord.id,
                        status: 'success',
                        table: queueRecord.source_table
                    });
                    
                } catch (error) {
                    console.error(`❌ Error procesando registro ${queueRecord.id}:`, error.message);
                    
                    // Marcar como error e incrementar contador de reintentos
                    await this.updateQueueStatus(
                        connection, 
                        queueRecord.id, 
                        'error', 
                        dbType, 
                        dbConfig.database,
                        error.message,
                        (queueRecord.retry_count || 0) + 1
                    );
                    
                    processedResults.push({
                        id: queueRecord.id,
                        status: 'error',
                        error: error.message,
                        table: queueRecord.source_table
                    });
                }
            }
            
            return processedResults;
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }

    /**
     * Actualizar estado en cola de encriptación
     */
    async updateQueueStatus(connection, recordId, status, dbType, database, errorMessage = null, retryCount = null) {
        const updates = [`status = ?`, `processed_at = ${dbType === 'postgresql' ? 'NOW()' : 'NOW()'}`];
        const params = [status];
        
        if (errorMessage) {
            updates.push('error_message = ?');
            params.push(errorMessage);
        }
        
        if (retryCount !== null) {
            updates.push('retry_count = ?');
            params.push(retryCount);
        }
        
        params.push(recordId);
        
        if (dbType === 'postgresql') {
            const pgParams = params.map((_, i) => `$${i + 1}`);
            pgParams.pop();
            pgParams.push(`$${params.length}`);
            
            await connection.query(`
                UPDATE encryption_queue 
                SET ${updates.join(', ').replace(/\?/g, (match, offset) => pgParams[params.indexOf(match)])}
                WHERE id = $${params.length}
            `, params);
        } else {
            await connection.query(`
                UPDATE ${database}.encryption_queue 
                SET ${updates.join(', ')}
                WHERE id = ?
            `, params);
        }
    }

    /**
     * Limpiar cola de encriptación (registros completados antiguos)
     */
    async cleanupEncryptionQueue(dbConfig, dbType, daysOld = 30) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            if (dbType === 'postgresql') {
                const result = await connection.query(`
                    DELETE FROM encryption_queue 
                    WHERE status IN ('completed', 'error') 
                    AND processed_at < NOW() - INTERVAL '${daysOld} days'
                    RETURNING id
                `);
                return result.rows.length;
            } else {
                const result = await connection.query(`
                    DELETE FROM ${dbConfig.database}.encryption_queue 
                    WHERE status IN ('completed', 'error') 
                    AND processed_at < DATE_SUB(NOW(), INTERVAL ${daysOld} DAY)
                `);
                return result[0].affectedRows;
            }
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }

    /**
     * Obtener estadísticas de cola de encriptación
     */
    async getQueueStats(dbConfig, dbType) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            let result;
            
            if (dbType === 'postgresql') {
                result = await connection.query(`
                    SELECT 
                        status,
                        COUNT(*) as count,
                        MIN(created_at) as oldest,
                        MAX(created_at) as newest,
                        AVG(retry_count) as avg_retries
                    FROM encryption_queue
                    GROUP BY status
                    ORDER BY status
                `);
                return result.rows;
            } else {
                result = await connection.query(`
                    SELECT 
                        status,
                        COUNT(*) as count,
                        MIN(created_at) as oldest,
                        MAX(created_at) as newest,
                        AVG(retry_count) as avg_retries
                    FROM ${dbConfig.database}.encryption_queue
                    GROUP BY status
                    ORDER BY status
                `);
                return result[0];
            }
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }
}

module.exports = EncryptedAuditService;
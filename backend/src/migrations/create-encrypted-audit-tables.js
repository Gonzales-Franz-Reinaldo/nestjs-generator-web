const { Client } = require('pg');
const mysql = require('mysql2/promise');

class EncryptedAuditMigration {
    constructor() {
        this.encryptedTablePrefix = 'aud_enc_';
    }

    /**
     * Ejecutar migración completa
     */
    async runMigration(dbConfig, dbType, options = {}) {
        console.log('🚀 Iniciando migración de tablas de auditoría encriptadas...');
        
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            // 1. Verificar tablas de auditoría existentes
            const auditTables = await this.getExistingAuditTables(connection, dbConfig, dbType);
            console.log(`📋 Encontradas ${auditTables.length} tablas de auditoría`);
            
            // 2. Crear esquema de auditoría encriptada si no existe
            await this.createEncryptedAuditSchema(connection, dbType, dbConfig.database);
            
            // 3. Crear tablas encriptadas
            const migrationResults = [];
            
            for (const tableName of auditTables) {
                try {
                    console.log(`🔧 Creando tabla encriptada para: ${tableName}`);
                    
                    await this.createEncryptedTable(connection, tableName, dbType, dbConfig.database);
                    
                    migrationResults.push({
                        tableName,
                        encryptedTableName: this.getEncryptedTableName(tableName),
                        status: 'success',
                        action: 'created'
                    });
                    
                    console.log(`✅ Tabla encriptada creada: ${this.getEncryptedTableName(tableName)}`);
                    
                } catch (error) {
                    console.error(`❌ Error creando tabla encriptada para ${tableName}:`, error.message);
                    
                    migrationResults.push({
                        tableName,
                        status: 'error',
                        error: error.message,
                        action: 'failed'
                    });
                }
            }
            
            // 4. Crear funciones y triggers necesarios
            await this.createEncryptionTriggers(connection, auditTables, dbType, dbConfig.database);
            
            // 5. Crear vistas y funciones auxiliares
            await this.createAuxiliaryObjects(connection, dbType, dbConfig.database);
            
            console.log('✅ Migración completada exitosamente');
            
            return {
                success: true,
                results: migrationResults,
                totalTables: auditTables.length,
                successfulTables: migrationResults.filter(r => r.status === 'success').length,
                failedTables: migrationResults.filter(r => r.status === 'error').length
            };
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
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
                AND tablename NOT LIKE '${this.encryptedTablePrefix}%'
                ORDER BY tablename
            `);
            return result.rows.map(row => row.tablename);
        } else {
            result = await connection.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = ? 
                AND table_name LIKE 'aud_%'
                AND table_name NOT LIKE '${this.encryptedTablePrefix}%'
                ORDER BY table_name
            `, [dbConfig.database]);
            return result[0].map(row => row.table_name);
        }
    }

    /**
     * Crear esquema para auditoría encriptada
     */
    async createEncryptedAuditSchema(connection, dbType, database) {
        if (dbType === 'postgresql') {
            // Crear schema si no existe
            await connection.query(`
                CREATE SCHEMA IF NOT EXISTS encrypted_audit;
            `);
            
            // Crear tipo personalizado para versiones de encriptación
            await connection.query(`
                DO $$ BEGIN
                    CREATE TYPE encrypted_audit.encryption_version AS ENUM ('1.0', '1.1', '2.0');
                EXCEPTION
                    WHEN duplicate_object THEN null;
                END $$;
            `);
            
        } else {
            // Para MySQL, verificar que la base de datos tenga charset correcto
            await connection.query(`
                ALTER DATABASE ${database} 
                CHARACTER SET = utf8mb4 
                COLLATE = utf8mb4_unicode_ci
            `);
        }
    }

    /**
     * Crear tabla encriptada individual
     */
    async createEncryptedTable(connection, originalTableName, dbType, database) {
        const encryptedTableName = this.getEncryptedTableName(originalTableName);
        
        if (dbType === 'postgresql') {
            // Eliminar tabla si existe
            await connection.query(`DROP TABLE IF EXISTS ${encryptedTableName} CASCADE`);
            
            // Crear tabla encriptada
            await connection.query(`
                CREATE TABLE ${encryptedTableName} (
                    id BIGSERIAL PRIMARY KEY,
                    encrypted_table_name TEXT NOT NULL,
                    encrypted_column_names TEXT NOT NULL,
                    encrypted_data_chunk_1 TEXT,
                    encrypted_data_chunk_2 TEXT,
                    encrypted_data_chunk_3 TEXT,
                    encrypted_data_chunk_4 TEXT,
                    encrypted_data_chunk_5 TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    record_hash VARCHAR(64) NOT NULL,
                    encryption_version VARCHAR(10) DEFAULT '1.0',
                    data_size INTEGER DEFAULT 0,
                    source_table VARCHAR(100) DEFAULT '${originalTableName}',
                    is_migrated BOOLEAN DEFAULT FALSE,
                    migration_date TIMESTAMP WITH TIME ZONE,
                    original_id BIGINT,
                    CONSTRAINT ${encryptedTableName}_hash_unique UNIQUE (record_hash)
                )
            `);
            
        } else {
            // Eliminar tabla si existe
            await connection.query(`DROP TABLE IF EXISTS ${database}.${encryptedTableName}`);
            
            // Crear tabla encriptada
            await connection.query(`
                CREATE TABLE ${database}.${encryptedTableName} (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    encrypted_table_name TEXT NOT NULL,
                    encrypted_column_names TEXT NOT NULL,
                    encrypted_data_chunk_1 TEXT,
                    encrypted_data_chunk_2 TEXT,
                    encrypted_data_chunk_3 TEXT,
                    encrypted_data_chunk_4 TEXT,
                    encrypted_data_chunk_5 TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    record_hash VARCHAR(64) NOT NULL,
                    encryption_version VARCHAR(10) DEFAULT '1.0',
                    data_size INT DEFAULT 0,
                    source_table VARCHAR(100) DEFAULT '${originalTableName}',
                    is_migrated BOOLEAN DEFAULT FALSE,
                    migration_date TIMESTAMP NULL,
                    original_id BIGINT,
                    UNIQUE KEY idx_${encryptedTableName}_hash (record_hash),
                    INDEX idx_${encryptedTableName}_created (created_at),
                    INDEX idx_${encryptedTableName}_source (source_table),
                    INDEX idx_${encryptedTableName}_version (encryption_version)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
        }
        
        // Crear índices adicionales
        await this.createTableIndexes(connection, encryptedTableName, dbType);
    }

    /**
     * Crear índices para tabla encriptada
     */
    async createTableIndexes(connection, tableName, dbType) {
        const indexes = [
            `CREATE INDEX IF NOT EXISTS idx_${tableName}_created_at ON ${tableName} (created_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_${tableName}_encryption_version ON ${tableName} (encryption_version)`,
            `CREATE INDEX IF NOT EXISTS idx_${tableName}_source_table ON ${tableName} (source_table)`,
            `CREATE INDEX IF NOT EXISTS idx_${tableName}_is_migrated ON ${tableName} (is_migrated)`,
            `CREATE INDEX IF NOT EXISTS idx_${tableName}_data_size ON ${tableName} (data_size)`
        ];
        
        for (const indexQuery of indexes) {
            try {
                if (dbType === 'mysql') {
                    // MySQL no soporta IF NOT EXISTS en índices
                    const cleanQuery = indexQuery.replace('IF NOT EXISTS ', '');
                    await connection.query(cleanQuery);
                } else {
                    await connection.query(indexQuery);
                }
            } catch (error) {
                // Ignorar errores de índices duplicados
                if (!error.message.includes('already exists') && !error.message.includes('Duplicate key')) {
                    console.warn(`⚠️ Error creando índice: ${error.message}`);
                }
            }
        }
    }

    /**
     * Crear triggers para auditoría encriptada automática
     */
    async createEncryptionTriggers(connection, auditTables, dbType, database) {
        console.log('🔧 Creando triggers de encriptación automática...');
        
        if (dbType === 'postgresql') {
            // Crear función trigger para PostgreSQL
            await connection.query(`
                CREATE OR REPLACE FUNCTION encrypted_audit_trigger()
                RETURNS TRIGGER AS $$
                BEGIN
                    -- Insertar en cola de procesamiento para encriptación asíncrona
                    INSERT INTO encryption_queue (
                        source_table,
                        operation,
                        record_data,
                        created_at
                    ) VALUES (
                        TG_TABLE_NAME,
                        TG_OP,
                        CASE 
                            WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
                            ELSE row_to_json(NEW)
                        END,
                        NOW()
                    );
                    
                    RETURN COALESCE(NEW, OLD);
                END;
                $$ LANGUAGE plpgsql;
            `);
            
        } else {
            // Para MySQL, crear procedure
            await connection.query(`
                DELIMITER //
                CREATE PROCEDURE IF NOT EXISTS InsertEncryptionQueue(
                    IN p_table_name VARCHAR(100),
                    IN p_operation VARCHAR(10),
                    IN p_record_data JSON
                )
                BEGIN
                    INSERT INTO ${database}.encryption_queue (
                        source_table,
                        operation,
                        record_data,
                        created_at
                    ) VALUES (
                        p_table_name,
                        p_operation,
                        p_record_data,
                        NOW()
                    );
                END//
                DELIMITER ;
            `);
        }
        
        // Crear tabla de cola de encriptación
        await this.createEncryptionQueue(connection, dbType, database);
        
        // Aplicar triggers a cada tabla de auditoría
        for (const tableName of auditTables) {
            await this.createTableTriggers(connection, tableName, dbType, database);
        }
    }

    /**
     * Crear tabla de cola de encriptación
     */
    async createEncryptionQueue(connection, dbType, database) {
        if (dbType === 'postgresql') {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS encryption_queue (
                    id BIGSERIAL PRIMARY KEY,
                    source_table VARCHAR(100) NOT NULL,
                    operation VARCHAR(10) NOT NULL,
                    record_data JSONB NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    processed_at TIMESTAMP WITH TIME ZONE,
                    status VARCHAR(20) DEFAULT 'pending',
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    INDEX idx_encryption_queue_status (status),
                    INDEX idx_encryption_queue_created (created_at)
                )
            `);
        } else {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS ${database}.encryption_queue (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    source_table VARCHAR(100) NOT NULL,
                    operation VARCHAR(10) NOT NULL,
                    record_data JSON NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed_at TIMESTAMP NULL,
                    status VARCHAR(20) DEFAULT 'pending',
                    error_message TEXT,
                    retry_count INT DEFAULT 0,
                    INDEX idx_encryption_queue_status (status),
                    INDEX idx_encryption_queue_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
        }
    }

    /**
     * Crear triggers para tabla específica
     */
    async createTableTriggers(connection, tableName, dbType, database) {
        const triggerNames = [`${tableName}_encrypt_insert`, `${tableName}_encrypt_update`, `${tableName}_encrypt_delete`];
        
        // Eliminar triggers existentes
        for (const triggerName of triggerNames) {
            try {
                await connection.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
            } catch (error) {
                // Ignorar errores
            }
        }
        
        if (dbType === 'postgresql') {
            // Crear triggers para PostgreSQL
            const operations = ['INSERT', 'UPDATE', 'DELETE'];
            
            for (const operation of operations) {
                await connection.query(`
                    CREATE TRIGGER ${tableName}_encrypt_${operation.toLowerCase()}
                    AFTER ${operation} ON ${tableName}
                    FOR EACH ROW
                    EXECUTE FUNCTION encrypted_audit_trigger()
                `);
            }
        } else {
            // Crear triggers para MySQL
            await connection.query(`
                CREATE TRIGGER ${tableName}_encrypt_insert
                AFTER INSERT ON ${database}.${tableName}
                FOR EACH ROW
                CALL ${database}.InsertEncryptionQueue('${tableName}', 'INSERT', JSON_OBJECT(
                    'data', JSON_OBJECT(${await this.getColumnList(connection, tableName, database)})
                ))
            `);
            
            await connection.query(`
                CREATE TRIGGER ${tableName}_encrypt_update
                AFTER UPDATE ON ${database}.${tableName}
                FOR EACH ROW
                CALL ${database}.InsertEncryptionQueue('${tableName}', 'UPDATE', JSON_OBJECT(
                    'old', JSON_OBJECT(${await this.getColumnList(connection, tableName, database, 'OLD')}),
                    'new', JSON_OBJECT(${await this.getColumnList(connection, tableName, database, 'NEW')})
                ))
            `);
            
            await connection.query(`
                CREATE TRIGGER ${tableName}_encrypt_delete
                AFTER DELETE ON ${database}.${tableName}
                FOR EACH ROW
                CALL ${database}.InsertEncryptionQueue('${tableName}', 'DELETE', JSON_OBJECT(
                    'data', JSON_OBJECT(${await this.getColumnList(connection, tableName, database, 'OLD')})
                ))
            `);
        }
    }

    /**
     * Obtener lista de columnas para triggers MySQL
     */
    async getColumnList(connection, tableName, database, prefix = 'NEW') {
        const result = await connection.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = ? AND table_name = ?
            ORDER BY ordinal_position
        `, [database, tableName]);
        
        return result[0]
            .map(row => `'${row.column_name}', ${prefix}.${row.column_name}`)
            .join(', ');
    }

    /**
     * Crear objetos auxiliares
     */
    async createAuxiliaryObjects(connection, dbType, database) {
        console.log('🔧 Creando objetos auxiliares...');
        
        if (dbType === 'postgresql') {
            // Crear función para obtener estadísticas
            await connection.query(`
                CREATE OR REPLACE FUNCTION get_encrypted_audit_stats()
                RETURNS TABLE(
                    table_name TEXT,
                    total_records BIGINT,
                    encrypted_size BIGINT,
                    first_record TIMESTAMP,
                    last_record TIMESTAMP
                ) AS $$
                BEGIN
                    RETURN QUERY
                    SELECT 
                        source_table::TEXT,
                        COUNT(*)::BIGINT,
                        SUM(data_size)::BIGINT,
                        MIN(created_at),
                        MAX(created_at)
                    FROM (
                        SELECT source_table, data_size, created_at
                        FROM aud_enc_usuarios
                        UNION ALL
                        SELECT source_table, data_size, created_at
                        FROM aud_enc_personas
                        -- Agregar más tablas dinámicamente
                    ) AS all_encrypted
                    GROUP BY source_table;
                END;
                $$ LANGUAGE plpgsql;
            `);
            
        } else {
            // Crear vista consolidada para MySQL
            await connection.query(`
                CREATE OR REPLACE VIEW ${database}.encrypted_audit_summary AS
                SELECT 
                    'overview' as summary_type,
                    COUNT(*) as total_tables,
                    SUM(table_records) as total_records,
                    SUM(total_size) as total_encrypted_size
                FROM (
                    SELECT 
                        source_table,
                        COUNT(*) as table_records,
                        SUM(data_size) as total_size
                    FROM ${database}.aud_enc_usuarios
                    GROUP BY source_table
                    UNION ALL
                    SELECT 
                        source_table,
                        COUNT(*) as table_records,
                        SUM(data_size) as total_size
                    FROM ${database}.aud_enc_personas
                    GROUP BY source_table
                ) as table_stats
            `);
        }
    }

    /**
     * Obtener nombre de tabla encriptada
     */
    getEncryptedTableName(originalTableName) {
        return originalTableName.replace('aud_', this.encryptedTablePrefix);
    }

    /**
     * Verificar estado de migración
     */
    async checkMigrationStatus(dbConfig, dbType) {
        const connection = await this.getConnection(dbConfig, dbType);
        
        try {
            const auditTables = await this.getExistingAuditTables(connection, dbConfig, dbType);
            const status = {
                totalAuditTables: auditTables.length,
                encryptedTables: [],
                pendingTables: [],
                migrationComplete: false
            };
            
            for (const tableName of auditTables) {
                const encryptedTableName = this.getEncryptedTableName(tableName);
                
                try {
                    if (dbType === 'postgresql') {
                        await connection.query(`SELECT 1 FROM ${encryptedTableName} LIMIT 1`);
                    } else {
                        await connection.query(`SELECT 1 FROM ${dbConfig.database}.${encryptedTableName} LIMIT 1`);
                    }
                    
                    status.encryptedTables.push({
                        original: tableName,
                        encrypted: encryptedTableName,
                        status: 'ready'
                    });
                } catch (error) {
                    status.pendingTables.push({
                        original: tableName,
                        encrypted: encryptedTableName,
                        status: 'pending'
                    });
                }
            }
            
            status.migrationComplete = status.pendingTables.length === 0;
            
            return status;
            
        } finally {
            if (dbType === 'postgresql') {
                await connection.end();
            } else {
                await connection.end();
            }
        }
    }
}

module.exports = EncryptedAuditMigration;
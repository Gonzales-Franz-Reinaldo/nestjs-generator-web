const crypto = require('crypto');

class AuditEncryption {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
        this.saltLength = 32;
        this.chunkCount = 5; // Número de columnas para dividir datos
    }

    /**
     * Generar clave derivada de password
     */
    deriveKey(password, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(this.saltLength);
        }
        
        const key = crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha256');
        return { key, salt };
    }

    /**
     * Encriptar datos completos de auditoría
     */
    encryptAuditRecord(auditData, encryptionKey) {
        try {
            // 1. Preparar datos completos
            const completeData = {
                metadata: {
                    tableName: auditData.tableName,
                    operation: auditData.operation,
                    timestamp: auditData.timestamp,
                    user: auditData.user,
                    ip: auditData.ip,
                    userAgent: auditData.userAgent
                },
                structure: auditData.tableStructure,
                record: auditData.record,
                encryptedAt: new Date().toISOString(),
                version: '1.0'
            };

            // 2. Convertir a JSON
            const jsonData = JSON.stringify(completeData);

            // 3. Encriptar datos principales
            const mainEncrypted = this.encryptData(jsonData, encryptionKey);

            // 4. Encriptar nombre de tabla
            const encryptedTableName = this.encryptText(auditData.tableName, encryptionKey);

            // 5. Encriptar nombres de columnas
            const columnNames = auditData.tableStructure.map(col => col.column_name);
            const encryptedColumnNames = this.encryptText(JSON.stringify(columnNames), encryptionKey);

            // 6. Dividir datos principales en chunks
            const dataChunks = this.splitEncryptedData(mainEncrypted, this.chunkCount);

            // 7. Generar hash de integridad
            const recordHash = this.generateIntegrityHash(mainEncrypted);

            return {
                encryptedTableName,
                encryptedColumnNames,
                dataChunks,
                recordHash,
                encryptionVersion: '1.0'
            };

        } catch (error) {
            throw new Error(`Error encriptando registro de auditoría: ${error.message}`);
        }
    }

    /**
     * Desencriptar registro de auditoría
     */
    decryptAuditRecord(encryptedRecord, encryptionKey) {
        try {
            // 1. Reconstruir datos principales
            const combinedData = this.combineEncryptedChunks(encryptedRecord.dataChunks);

            // 2. Verificar integridad
            const calculatedHash = this.generateIntegrityHash(combinedData);
            if (calculatedHash !== encryptedRecord.recordHash) {
                throw new Error('Integridad de datos comprometida');
            }

            // 3. Desencriptar datos principales
            const decryptedData = this.decryptData(combinedData, encryptionKey);
            const auditData = JSON.parse(decryptedData);

            // 4. Desencriptar nombre de tabla
            const tableName = this.decryptText(encryptedRecord.encryptedTableName, encryptionKey);

            // 5. Desencriptar nombres de columnas
            const columnNames = JSON.parse(
                this.decryptText(encryptedRecord.encryptedColumnNames, encryptionKey)
            );

            return {
                tableName,
                columnNames,
                auditData,
                integrity: 'verified',
                decryptedAt: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Error desencriptando registro: ${error.message}`);
        }
    }

    /**
     * Encriptar datos con AES-256-GCM
     */
    encryptData(data, password) {
        const { key, salt } = this.deriveKey(password);
        const iv = crypto.randomBytes(this.ivLength);
        
        const cipher = crypto.createCipher(this.algorithm, key);
        cipher.setAAD(salt);
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const tag = cipher.getAuthTag();
        
        const result = {
            encrypted,
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            tag: tag.toString('hex'),
            timestamp: Date.now()
        };
        
        return Buffer.from(JSON.stringify(result)).toString('base64');
    }

    /**
     * Desencriptar datos
     */
    decryptData(encryptedData, password) {
        const decoded = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
        
        const salt = Buffer.from(decoded.salt, 'hex');
        const tag = Buffer.from(decoded.tag, 'hex');
        const encrypted = decoded.encrypted;
        
        const { key } = this.deriveKey(password, salt);
        
        const decipher = crypto.createDecipher(this.algorithm, key);
        decipher.setAAD(salt);
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Encriptar solo texto (para nombres)
     */
    encryptText(text, password) {
        const { key, salt } = this.deriveKey(password);
        const iv = crypto.randomBytes(this.ivLength);
        
        const cipher = crypto.createCipher(this.algorithm, key);
        cipher.setAAD(salt);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const tag = cipher.getAuthTag();
        
        const result = {
            encrypted,
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            tag: tag.toString('hex')
        };
        
        return Buffer.from(JSON.stringify(result)).toString('base64');
    }

    /**
     * Desencriptar texto
     */
    decryptText(encryptedText, password) {
        const decoded = JSON.parse(Buffer.from(encryptedText, 'base64').toString());
        
        const salt = Buffer.from(decoded.salt, 'hex');
        const tag = Buffer.from(decoded.tag, 'hex');
        const encrypted = decoded.encrypted;
        
        const { key } = this.deriveKey(password, salt);
        
        const decipher = crypto.createDecipher(this.algorithm, key);
        decipher.setAAD(salt);
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Dividir datos encriptados en múltiples columnas
     */
    splitEncryptedData(encryptedString, columnCount) {
        const chunkSize = Math.ceil(encryptedString.length / columnCount);
        const chunks = [];
        
        for (let i = 0; i < encryptedString.length; i += chunkSize) {
            chunks.push(encryptedString.substring(i, i + chunkSize));
        }
        
        // Rellenar con datos aleatorios si es necesario
        while (chunks.length < columnCount) {
            chunks.push(crypto.randomBytes(Math.floor(chunkSize / 2)).toString('hex'));
        }
        
        return chunks;
    }

    /**
     * Combinar chunks encriptados
     */
    combineEncryptedChunks(chunks) {
        return chunks.filter(chunk => chunk && chunk.length > 0).join('');
    }

    /**
     * Generar hash de integridad
     */
    generateIntegrityHash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generar nombres de columnas aleatorios para ofuscar estructura
     */
    generateRandomColumnNames(count = 10) {
        const names = [];
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        
        for (let i = 0; i < count; i++) {
            let name = '';
            const length = Math.floor(Math.random() * 8) + 5; // 5-12 caracteres
            
            for (let j = 0; j < length; j++) {
                name += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            names.push(name);
        }
        
        return names;
    }

    /**
     * Ofuscar estructura de tabla para mayor seguridad
     */
    obfuscateTableStructure(tableName, columns, encryptionKey) {
        const obfuscated = {
            originalTable: tableName,
            obfuscatedName: this.generateRandomTableName(),
            columnMapping: {},
            encryptedAt: new Date().toISOString()
        };
        
        const randomColumnNames = this.generateRandomColumnNames(columns.length);
        
        columns.forEach((column, index) => {
            obfuscated.columnMapping[column] = randomColumnNames[index];
        });
        
        // Encriptar la configuración de ofuscación
        const encryptedConfig = this.encryptData(JSON.stringify(obfuscated), encryptionKey);
        
        return {
            obfuscatedStructure: obfuscated,
            encryptedConfig
        };
    }

    /**
     * Generar nombre de tabla aleatorio
     */
    generateRandomTableName() {
        const prefixes = ['tbl', 'data', 'info', 'rec', 'obj'];
        const suffixes = ['_001', '_data', '_info', '_rec', '_obj'];
        
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const randomPart = crypto.randomBytes(4).toString('hex');
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        
        return `${prefix}_${randomPart}${suffix}`;
    }

    /**
     * Validar integridad de datos encriptados
     */
    validateIntegrity(encryptedRecord) {
        try {
            if (!encryptedRecord.dataChunks || !encryptedRecord.recordHash) {
                return { valid: false, error: 'Datos incompletos' };
            }
            
            const combinedData = this.combineEncryptedChunks(encryptedRecord.dataChunks);
            const calculatedHash = this.generateIntegrityHash(combinedData);
            
            const valid = calculatedHash === encryptedRecord.recordHash;
            
            return {
                valid,
                error: valid ? null : 'Hash de integridad no coincide'
            };
        } catch (error) {
            return {
                valid: false,
                error: `Error validando integridad: ${error.message}`
            };
        }
    }

    /**
     * Generar resumen de encriptación para logs
     */
    generateEncryptionSummary(encryptedRecord) {
        const summary = {
            encryptionVersion: encryptedRecord.encryptionVersion,
            dataChunkCount: encryptedRecord.dataChunks.length,
            totalDataSize: encryptedRecord.dataChunks.reduce((total, chunk) => total + chunk.length, 0),
            integrityHash: encryptedRecord.recordHash.substring(0, 8) + '...',
            encryptedElements: {
                tableName: !!encryptedRecord.encryptedTableName,
                columnNames: !!encryptedRecord.encryptedColumnNames,
                data: encryptedRecord.dataChunks.length > 0
            }
        };
        
        return summary;
    }
}

module.exports = AuditEncryption;
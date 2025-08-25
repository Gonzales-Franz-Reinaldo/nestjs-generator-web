const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class KeyManagementService {
    constructor() {
        this.keyStorePath = path.join(__dirname, '../../config/encryption-keys.json');
        this.masterKeyLength = 64; // 512 bits
        this.keyRotationInterval = 30 * 24 * 60 * 60 * 1000; // 30 días
    }

    /**
     * Generar clave maestra segura
     */
    generateMasterKey() {
        return crypto.randomBytes(this.masterKeyLength).toString('hex');
    }

    /**
     * Generar salt único
     */
    generateSalt(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Derivar clave de base de datos específica
     */
    deriveKeyForDatabase(masterKey, databaseName, salt) {
        const combined = `${masterKey}:${databaseName}:${salt}`;
        return crypto.pbkdf2Sync(combined, salt, 100000, 32, 'sha256').toString('hex');
    }

    /**
     * Crear hash de verificación para clave
     */
    createKeyHash(key) {
        const salt = this.generateSalt(16);
        const hash = crypto.pbkdf2Sync(key, salt, 100000, 64, 'sha256').toString('hex');
        return { hash, salt };
    }

    /**
     * Verificar clave contra hash
     */
    verifyKey(key, hash, salt) {
        const computedHash = crypto.pbkdf2Sync(key, salt, 100000, 64, 'sha256').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
    }

    /**
     * Guardar configuración de claves
     */
    async saveKeyConfiguration(config) {
        try {
            const keyConfig = {
                ...config,
                createdAt: new Date().toISOString(),
                version: '1.0',
                lastRotation: new Date().toISOString()
            };

            await fs.writeFile(this.keyStorePath, JSON.stringify(keyConfig, null, 2));
            console.log('✅ Configuración de claves guardada');
        } catch (error) {
            console.error('❌ Error guardando configuración de claves:', error);
            throw error;
        }
    }

    /**
     * Cargar configuración de claves
     */
    async loadKeyConfiguration() {
        try {
            const data = await fs.readFile(this.keyStorePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Archivo no existe, crear configuración por defecto
                const defaultConfig = {
                    masterKey: this.generateMasterKey(),
                    databases: {},
                    createdAt: new Date().toISOString(),
                    version: '1.0'
                };
                
                await this.saveKeyConfiguration(defaultConfig);
                return defaultConfig;
            }
            throw error;
        }
    }

    /**
     * Obtener o crear clave para base de datos específica
     */
    async getOrCreateDatabaseKey(databaseName, userProvidedKey = null) {
        const config = await this.loadKeyConfiguration();
        
        if (userProvidedKey) {
            // Usar clave proporcionada por usuario
            const salt = this.generateSalt();
            const derivedKey = this.deriveKeyForDatabase(userProvidedKey, databaseName, salt);
            const keyHash = this.createKeyHash(userProvidedKey);
            
            config.databases[databaseName] = {
                salt,
                keyHash: keyHash.hash,
                keySalt: keyHash.salt,
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString()
            };
            
            await this.saveKeyConfiguration(config);
            return derivedKey;
        }
        
        // Usar clave existente o crear nueva
        if (config.databases[databaseName]) {
            const dbConfig = config.databases[databaseName];
            dbConfig.lastUsed = new Date().toISOString();
            await this.saveKeyConfiguration(config);
            
            return this.deriveKeyForDatabase(config.masterKey, databaseName, dbConfig.salt);
        }
        
        // Crear nueva clave para base de datos
        const salt = this.generateSalt();
        const derivedKey = this.deriveKeyForDatabase(config.masterKey, databaseName, salt);
        
        config.databases[databaseName] = {
            salt,
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };
        
        await this.saveKeyConfiguration(config);
        return derivedKey;
    }

    /**
     * Validar clave de usuario para base de datos
     */
    async validateUserKey(databaseName, userKey) {
        try {
            const config = await this.loadKeyConfiguration();
            const dbConfig = config.databases[databaseName];
            
            if (!dbConfig || !dbConfig.keyHash) {
                return { valid: false, error: 'No hay clave configurada para esta base de datos' };
            }
            
            const isValid = this.verifyKey(userKey, dbConfig.keyHash, dbConfig.keySalt);
            
            if (isValid) {
                // Actualizar último uso
                dbConfig.lastUsed = new Date().toISOString();
                await this.saveKeyConfiguration(config);
            }
            
            return { valid: isValid };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Rotar claves (para seguridad periódica)
     */
    async rotateKeys() {
        console.log('🔄 Iniciando rotación de claves...');
        
        try {
            const config = await this.loadKeyConfiguration();
            const oldMasterKey = config.masterKey;
            const newMasterKey = this.generateMasterKey();
            
            // Actualizar clave maestra
            config.masterKey = newMasterKey;
            config.lastRotation = new Date().toISOString();
            config.rotationHistory = config.rotationHistory || [];
            
            // Guardar referencia de clave anterior (encriptada)
            config.rotationHistory.push({
                rotatedAt: new Date().toISOString(),
                keyHash: crypto.createHash('sha256').update(oldMasterKey).digest('hex')
            });
            
            // Mantener solo últimas 5 rotaciones
            if (config.rotationHistory.length > 5) {
                config.rotationHistory = config.rotationHistory.slice(-5);
            }
            
            await this.saveKeyConfiguration(config);
            
            console.log('✅ Rotación de claves completada');
            return { success: true, rotatedAt: config.lastRotation };
        } catch (error) {
            console.error('❌ Error en rotación de claves:', error);
            throw error;
        }
    }

    /**
     * Obtener estadísticas de uso de claves
     */
    async getKeyUsageStats() {
        try {
            const config = await this.loadKeyConfiguration();
            
            const stats = {
                masterKeyAge: Date.now() - new Date(config.createdAt).getTime(),
                totalDatabases: Object.keys(config.databases).length,
                lastRotation: config.lastRotation,
                rotationHistory: config.rotationHistory?.length || 0,
                databases: {}
            };
            
            for (const [dbName, dbConfig] of Object.entries(config.databases)) {
                stats.databases[dbName] = {
                    createdAt: dbConfig.createdAt,
                    lastUsed: dbConfig.lastUsed,
                    age: Date.now() - new Date(dbConfig.createdAt).getTime(),
                    hasUserKey: !!dbConfig.keyHash
                };
            }
            
            return stats;
        } catch (error) {
            throw new Error(`Error obteniendo estadísticas: ${error.message}`);
        }
    }

    /**
     * Limpiar claves no utilizadas
     */
    async cleanupUnusedKeys(maxAge = 90 * 24 * 60 * 60 * 1000) { // 90 días
        try {
            const config = await this.loadKeyConfiguration();
            const now = Date.now();
            let cleanedCount = 0;
            
            for (const [dbName, dbConfig] of Object.entries(config.databases)) {
                const lastUsed = new Date(dbConfig.lastUsed).getTime();
                const age = now - lastUsed;
                
                if (age > maxAge) {
                    delete config.databases[dbName];
                    cleanedCount++;
                    console.log(`🧹 Limpiada clave no utilizada para: ${dbName}`);
                }
            }
            
            if (cleanedCount > 0) {
                await this.saveKeyConfiguration(config);
                console.log(`✅ Limpieza completada: ${cleanedCount} claves eliminadas`);
            }
            
            return { cleanedCount };
        } catch (error) {
            throw new Error(`Error en limpieza: ${error.message}`);
        }
    }

    /**
     * Exportar configuración de claves (para backup)
     */
    async exportKeyConfiguration(password) {
        try {
            const config = await this.loadKeyConfiguration();
            
            // Encriptar configuración con password
            const cipher = crypto.createCipher('aes-256-gcm', password);
            let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();
            
            const exportData = {
                encrypted,
                tag: tag.toString('hex'),
                exportedAt: new Date().toISOString(),
                version: config.version
            };
            
            return Buffer.from(JSON.stringify(exportData)).toString('base64');
        } catch (error) {
            throw new Error(`Error exportando configuración: ${error.message}`);
        }
    }

    /**
     * Importar configuración de claves (desde backup)
     */
    async importKeyConfiguration(exportedData, password) {
        try {
            const importData = JSON.parse(Buffer.from(exportedData, 'base64').toString());
            
            // Desencriptar configuración
            const decipher = crypto.createDecipher('aes-256-gcm', password);
            decipher.setAuthTag(Buffer.from(importData.tag, 'hex'));
            
            let decrypted = decipher.update(importData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            const config = JSON.parse(decrypted);
            
            // Validar configuración
            if (!config.masterKey || !config.databases) {
                throw new Error('Configuración inválida');
            }
            
            // Agregar metadatos de importación
            config.importedAt = new Date().toISOString();
            config.importedFrom = importData.exportedAt;
            
            await this.saveKeyConfiguration(config);
            
            console.log('✅ Configuración de claves importada exitosamente');
            return { success: true, importedAt: config.importedAt };
        } catch (error) {
            throw new Error(`Error importando configuración: ${error.message}`);
        }
    }
}

module.exports = KeyManagementService;
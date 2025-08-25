const express = require('express');
const router = express.Router();
const EncryptedAuditService = require('../services/encrypted-audit.service');

const encryptedAuditService = new EncryptedAuditService();

/**
 * @route POST /api/encrypted-audit/migrate
 * @desc Migrar tablas de auditoría existentes a formato encriptado
 */
router.post('/migrate', async (req, res) => {
    try {
        const { dbConfig, dbType, encryptionKey } = req.body;
        
        if (!dbConfig || !dbType || !encryptionKey) {
            return res.status(400).json({
                success: false,
                message: 'dbConfig, dbType y encryptionKey son requeridos'
            });
        }
        
        console.log('🔄 Iniciando migración de auditoría encriptada...');
        
        const results = await encryptedAuditService.migrateToEncryptedAudit(
            dbConfig, 
            dbType, 
            encryptionKey
        );
        
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        res.json({
            success: true,
            message: `Migración completada: ${successCount} exitosas, ${errorCount} errores`,
            results,
            summary: {
                total: results.length,
                successful: successCount,
                errors: errorCount
            }
        });
        
    } catch (error) {
        console.error('❌ Error en migración:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

/**
 * @route GET /api/encrypted-audit/tables
 * @desc Listar tablas de auditoría encriptadas
 */
router.post('/tables', async (req, res) => {
    try {
        const { dbConfig, dbType } = req.body;
        
        if (!dbConfig || !dbType) {
            return res.status(400).json({
                success: false,
                message: 'dbConfig y dbType son requeridos'
            });
        }
        
        const tables = await encryptedAuditService.listEncryptedAuditTables(dbConfig, dbType);
        
        res.json({
            success: true,
            data: tables,
            count: tables.length
        });
        
    } catch (error) {
        console.error('❌ Error listando tablas:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo tablas encriptadas',
            error: error.message
        });
    }
});

/**
 * @route POST /api/encrypted-audit/records
 * @desc Obtener registros encriptados (sin desencriptar)
 */
router.post('/records', async (req, res) => {
    try {
        const { dbConfig, dbType, tableName, limit = 50, offset = 0 } = req.body;
        
        if (!dbConfig || !dbType || !tableName) {
            return res.status(400).json({
                success: false,
                message: 'dbConfig, dbType y tableName son requeridos'
            });
        }
        
        const records = await encryptedAuditService.getEncryptedRecords(
            dbConfig, 
            dbType, 
            tableName, 
            limit, 
            offset
        );
        
        res.json({
            success: true,
            data: records,
            count: records.length,
            pagination: {
                limit,
                offset,
                hasMore: records.length === limit
            }
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo registros:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo registros encriptados',
            error: error.message
        });
    }
});

/**
 * @route POST /api/encrypted-audit/decrypt
 * @desc Desencriptar registros específicos
 */
router.post('/decrypt', async (req, res) => {
    try {
        const { 
            dbConfig, 
            dbType, 
            tableName, 
            encryptionKey, 
            recordIds = [], 
            limit = 50 
        } = req.body;
        
        if (!dbConfig || !dbType || !tableName || !encryptionKey) {
            return res.status(400).json({
                success: false,
                message: 'dbConfig, dbType, tableName y encryptionKey son requeridos'
            });
        }
        
        // Validar clave primero
        const validation = await encryptedAuditService.validateEncryptionKey(
            dbConfig, 
            dbType, 
            tableName, 
            encryptionKey
        );
        
        if (!validation.valid) {
            return res.status(401).json({
                success: false,
                message: validation.error || 'Clave de encriptación incorrecta'
            });
        }
        
        const decryptedRecords = await encryptedAuditService.decryptRecords(
            dbConfig, 
            dbType, 
            tableName, 
            encryptionKey, 
            recordIds, 
            limit
        );
        
        const successCount = decryptedRecords.filter(r => !r.error).length;
        const errorCount = decryptedRecords.filter(r => r.error).length;
        
        res.json({
            success: true,
            data: decryptedRecords,
            summary: {
                total: decryptedRecords.length,
                successful: successCount,
                errors: errorCount
            }
        });
        
    } catch (error) {
        console.error('❌ Error desencriptando:', error);
        res.status(500).json({
            success: false,
            message: 'Error desencriptando registros',
            error: error.message
        });
    }
});

/**
 * @route POST /api/encrypted-audit/validate-key
 * @desc Validar clave de encriptación
 */
router.post('/validate-key', async (req, res) => {
    try {
        const { dbConfig, dbType, tableName, encryptionKey } = req.body;
        
        if (!dbConfig || !dbType || !tableName || !encryptionKey) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos'
            });
        }
        
        const validation = await encryptedAuditService.validateEncryptionKey(
            dbConfig, 
            dbType, 
            tableName, 
            encryptionKey
        );
        
        res.json({
            success: validation.valid,
            message: validation.valid ? 'Clave válida' : validation.error
        });
        
    } catch (error) {
        console.error('❌ Error validando clave:', error);
        res.status(500).json({
            success: false,
            message: 'Error validando clave',
            error: error.message
        });
    }
});

/**
 * @route POST /api/encrypted-audit/stats
 * @desc Obtener estadísticas de tabla encriptada
 */
router.post('/stats', async (req, res) => {
    try {
        const { dbConfig, dbType, tableName } = req.body;
        
        if (!dbConfig || !dbType || !tableName) {
            return res.status(400).json({
                success: false,
                message: 'dbConfig, dbType y tableName son requeridos'
            });
        }
        
        const stats = await encryptedAuditService.getEncryptedAuditStats(
            dbConfig, 
            dbType, 
            tableName
        );
        
        res.json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas',
            error: error.message
        });
    }
});

module.exports = router;
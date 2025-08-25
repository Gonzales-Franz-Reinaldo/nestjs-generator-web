const express = require('express');
const router = express.Router();
const databaseService = require('../services/database.service');

// POST /api/database/test
router.post('/test', async (req, res) => {
    try {
        const databaseConfig = req.body;

        // Validar configuración requerida
        if (!databaseConfig.host || !databaseConfig.database || !databaseConfig.type) {
            return res.status(400).json({
                success: false,
                message: 'Configuración de base de datos incompleta'
            });
        }

        const result = await databaseService.testConnection(databaseConfig);

        res.json(result);
    } catch (error) {
        console.error('Error testing database connection:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor: ' + error.message
        });
    }
});

// GET /api/database/tables/:type
router.get('/tables/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const config = req.query;

        if (!['postgresql', 'mysql'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Tipo de base de datos no soportado'
            });
        }

        const tables = await databaseService.getTables({ type, ...config });

        res.json({
            success: true,
            tables: tables
        });
    } catch (error) {
        console.error('Error getting tables:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const generatorService = require('../services/generator.service');
const databaseService = require('../services/database.service');
const path = require('path');
const fs = require('fs');

// POST /api/generator/generate
router.post('/generate', async (req, res) => {

    console.log('🔍 POST /api/generator/generate received');
    console.log('📊 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { database: databaseConfig, project: projectConfig } = req.body;

        // Validar datos requeridos
        if (!databaseConfig || !projectConfig) {
            return res.status(400).json({
                success: false,
                message: 'Configuración de base de datos y proyecto requeridas'
            });
        }

        // Validar que la conexión funcione antes de generar
        const connectionTest = await databaseService.testConnection(databaseConfig);
        if (!connectionTest.success) {
            return res.status(400).json({
                success: false,
                message: 'Error de conexión a la base de datos: ' + connectionTest.message
            });
        }

        console.log(`🚀 Starting project generation: ${projectConfig.name}`);

        // Generar proyecto
        const result = await generatorService.generateProject(
            databaseConfig,
            projectConfig,
            (progress) => {
                // En una implementación real, podrías usar WebSockets para enviar progreso en tiempo real
                console.log(`[${progress.percentage}%] ${progress.message}`);
            }
        );

        console.log(`✅ Project generation completed: ${result.projectName}`);

        res.json({
            success: true,
            message: 'Proyecto generado exitosamente',
            projectInfo: {
                name: result.projectName,
                path: result.projectPath,
                downloadUrl: `/api/generator/download/${result.sessionId}`,
                size: result.size,
                createdAt: new Date().toISOString(),
                sessionId: result.sessionId 
            }
        });
    } catch (error) {
        console.error('❌ Error generating project:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor: ' + error.message,
            error: error.message
        });
    }
});

// GET /api/generator/download/:sessionId
router.get('/download/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const project = generatorService.getProjectById(sessionId);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Proyecto no encontrado'
            });
        }

        const zipPath = project.zipPath;
        if (!fs.existsSync(zipPath)) {
            return res.status(404).json({
                success: false,
                message: 'Archivo de proyecto no encontrado'
            });
        }

        const fileName = path.basename(zipPath);

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const fileStream = fs.createReadStream(zipPath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('Error streaming file:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Error descargando archivo'
                });
            }
        });

        console.log(`📥 Downloaded project: ${fileName}`);
    } catch (error) {
        console.error('Error downloading project:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/generator/projects
router.get('/projects', (req, res) => {
    try {
        const projects = generatorService.getAllProjects();

        res.json(
            projects.map(project => ({
                name: project.projectName,
                path: project.projectPath,
                downloadUrl: `/api/generator/download/${project.sessionId}`,
                size: project.size,
                createdAt: project.createdAt
            }))
        );
    } catch (error) {
        console.error('Error getting projects:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/generator/projects/:sessionId
router.delete('/projects/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const result = await generatorService.deleteProject(sessionId);

        if (result.success) {
            res.json({
                success: true,
                message: 'Proyecto eliminado exitosamente'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Proyecto no encontrado'
            });
        }
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
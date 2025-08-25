const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { NestJSBackendGenerator } = require('../core/nestjs-generator');

class GeneratorService {
    constructor() {
        this.activeGenerations = new Map();
        this.generatedProjects = new Map();
        this.outputDir = path.join(__dirname, '..', '..', '..', '..', 'generated-projects');

        // Asegurar que existe el directorio de salida
        fs.ensureDirSync(this.outputDir);
    }

    async generateProject(databaseConfig, projectConfig, progressCallback) {
        const sessionId = uuidv4();
        // const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // solo la fecha
        const date = new Date().toISOString().split('T')[0];
        const projectName = `${projectConfig.name}-${databaseConfig.type}-${date}`;
        const projectPath = path.join(this.outputDir, projectName);

        try {
            console.log(`🏗️  Initializing project generation: ${projectName}`);

            // Validar configuración
            this.validateConfig(databaseConfig, projectConfig);

            // Marcar como generación activa
            this.activeGenerations.set(sessionId, {
                startTime: new Date(),
                status: 'running',
                projectName
            });

            // Callback de progreso wrapper
            const wrappedCallback = (progress) => {
                if (progressCallback) {
                    progressCallback(progress);
                }

                // Actualizar estado interno
                const activeGen = this.activeGenerations.get(sessionId);
                if (activeGen) {
                    activeGen.lastProgress = progress;
                }
            };

            // Crear instancia del generador basado en tu generate-backend3.ts
            const generator = new NestJSBackendGenerator(
                databaseConfig,
                projectPath,
                wrappedCallback
            );

            console.log(`📊 Connecting to ${databaseConfig.type} database...`);
            await generator.connect();

            console.log(`🔍 Analyzing database schema...`);
            wrappedCallback({
                type: 'progress',
                step: 'analyzing',
                message: 'Analizando esquema de base de datos...',
                percentage: 10
            });

            const tables = await generator.getTables();
            console.log(`📋 Found ${tables.length} tables to process`);

            wrappedCallback({
                type: 'progress',
                step: 'generating',
                message: `Generando proyecto para ${tables.length} tablas...`,
                percentage: 20
            });

            // Generar el proyecto usando el método de tu clase
            await generator.generateProject({
                name: projectConfig.name,
                description: projectConfig.description || `Generated NestJS Backend for ${databaseConfig.type}`
            });

            console.log(`📦 Project structure created at: ${projectPath}`);

            await generator.disconnect();

            wrappedCallback({
                type: 'progress',
                step: 'packaging',
                message: 'Empaquetando proyecto...',
                percentage: 90
            });

            // Crear ZIP del proyecto
            const zipPath = await this.createProjectZip(projectPath, projectName);
            const stats = fs.statSync(zipPath);
            const size = this.formatFileSize(stats.size);

            console.log(`📦 Created ZIP package: ${path.basename(zipPath)} (${size})`);

            wrappedCallback({
                type: 'progress',
                step: 'completed',
                message: 'Proyecto generado exitosamente',
                percentage: 100
            });

            // Guardar resultado
            const projectResult = {
                sessionId,
                projectName,
                projectPath,
                zipPath,
                size,
                createdAt: new Date().toISOString(),
                databaseType: databaseConfig.type,
                tableCount: tables.length
            };

            this.generatedProjects.set(sessionId, projectResult);
            this.activeGenerations.delete(sessionId);

            console.log(`✅ Project generation completed successfully: ${projectName}`);

            return projectResult;
        } catch (error) {
            console.error(`❌ Project generation failed for ${projectName}:`, error);

            this.activeGenerations.delete(sessionId);

            // Limpiar archivos parciales
            if (fs.existsSync(projectPath)) {
                fs.removeSync(projectPath);
            }

            throw error;
        }
    }

    async createProjectZip(projectPath, projectName) {
        const zipPath = path.join(path.dirname(projectPath), `${projectName}.zip`);

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Máxima compresión
            });

            output.on('close', () => {
                console.log(`📦 ZIP created: ${archive.pointer()} total bytes`);
                resolve(zipPath);
            });

            archive.on('error', (error) => {
                console.error('❌ Error creating ZIP:', error);
                reject(error);
            });

            archive.pipe(output);
            archive.directory(projectPath, projectName);
            archive.finalize();
        });
    }

    validateConfig(databaseConfig, projectConfig) {
        // Validaciones de base de datos
        if (!databaseConfig.host || !databaseConfig.database || !databaseConfig.type) {
            throw new Error('Configuración de base de datos incompleta');
        }

        if (!['postgresql', 'mysql'].includes(databaseConfig.type)) {
            throw new Error('Tipo de base de datos no soportado');
        }

        // Validaciones de proyecto
        if (!projectConfig.name) {
            throw new Error('Nombre de proyecto requerido');
        }

        // Validar nombre de proyecto (solo alfanuméricos, guiones y guiones bajos)
        if (!/^[a-zA-Z0-9-_]+$/.test(projectConfig.name)) {
            throw new Error('El nombre del proyecto solo puede contener letras, números, guiones y guiones bajos');
        }

        // Validar longitud del nombre
        if (projectConfig.name.length < 3 || projectConfig.name.length > 50) {
            throw new Error('El nombre del proyecto debe tener entre 3 y 50 caracteres');
        }
    }

    getProjectById(sessionId) {
        return this.generatedProjects.get(sessionId);
    }

    getAllProjects() {
        return Array.from(this.generatedProjects.values());
    }

    getGenerationStatus(sessionId) {
        return this.activeGenerations.get(sessionId);
    }

    async deleteProject(sessionId) {
        const project = this.generatedProjects.get(sessionId);

        if (!project) {
            return { success: false, message: 'Proyecto no encontrado' };
        }

        try {
            // Eliminar archivos físicos
            if (fs.existsSync(project.projectPath)) {
                fs.removeSync(project.projectPath);
            }

            if (fs.existsSync(project.zipPath)) {
                fs.removeSync(project.zipPath);
            }

            // Eliminar de memoria
            this.generatedProjects.delete(sessionId);

            console.log(`🗑️  Deleted project: ${project.projectName}`);

            return { success: true };
        } catch (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    }

    // Limpiar proyectos antiguos automáticamente
    cleanupOldProjects() {
        const now = new Date();
        const maxAge = 24 * 60 * 60 * 1000; // 24 horas
        let cleanedCount = 0;

        for (const [sessionId, project] of this.generatedProjects) {
            const projectAge = now - new Date(project.createdAt);

            if (projectAge > maxAge) {
                this.deleteProject(sessionId).catch(console.error);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} old projects`);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Inicializar limpieza automática
    startCleanupSchedule() {
        // Limpiar cada 6 horas
        setInterval(() => {
            this.cleanupOldProjects();
        }, 6 * 60 * 60 * 1000);

        console.log('🧹 Automatic cleanup scheduled every 6 hours');
    }
}

module.exports = new GeneratorService();
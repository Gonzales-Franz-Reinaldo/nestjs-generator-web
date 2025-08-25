import { useState, useCallback } from 'react';
import type {
    DatabaseConfig,
    ProjectConfig,
    GenerationStatus,
    GeneratedProjectInfo,
    TestConnectionResponse
} from '../types';
import { apiService } from '../services/api';

export function useGenerator() {
    const [databaseConfig, setDatabaseConfig] = useState<DatabaseConfig>({
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: '',
        database: 'db_automation',
    });

    const [projectConfig, setProjectConfig] = useState<ProjectConfig>({
        name: 'my-nestjs-backend',
        description: 'Generated NestJS Backend',
    });

    const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
        status: 'idle',
        progress: 0,
        message: 'Ready to generate',
        logs: [],
    });

    const [generatedProjects, setGeneratedProjects] = useState<GeneratedProjectInfo[]>([]);

    const updateStatus = useCallback((update: Partial<GenerationStatus>) => {
        setGenerationStatus(prev => ({
            ...prev,
            ...update,
            logs: update.logs ? [...prev.logs, ...update.logs] : prev.logs,
        }));
    }, []);

    const testConnection = useCallback(async (): Promise<boolean> => {
        try {
            updateStatus({
                status: 'connecting',
                progress: 0,
                message: 'Testing database connection...',
                logs: [`🔌 Connecting to ${databaseConfig.type}://${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`]
            });

            const result: TestConnectionResponse = await apiService.testConnection(databaseConfig);

            if (result.success) {
                updateStatus({
                    status: 'idle',
                    progress: 100,
                    message: `✅ Connected successfully! Found ${result.tables?.length || 0} tables`,
                    logs: [
                        '✅ Connection successful!',
                        `📊 Tables found: ${result.tables?.length || 0}`,
                        ...(result.tables?.slice(0, 5).map(table => `  - ${table}`) || []),
                        ...(result.tables && result.tables.length > 5 ? ['  ...and more'] : [])
                    ]
                });
                return true;
            } else {
                updateStatus({
                    status: 'error',
                    message: '❌ Connection failed',
                    error: result.message,
                    logs: [`❌ Error: ${result.message}`]
                });
                return false;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            updateStatus({
                status: 'error',
                message: '❌ Connection failed',
                error: errorMessage,
                logs: [`❌ Connection error: ${errorMessage}`]
            });
            return false;
        }
    }, [databaseConfig, updateStatus]);

    const generateProject = useCallback(async (): Promise<GeneratedProjectInfo | null> => {
        try {
            updateStatus({
                status: 'generating',
                progress: 0,
                message: 'Starting project generation...',
                logs: ['🚀 Starting NestJS backend generation...']
            });

            // Simular progreso durante la generación
            const progressSteps = [
                { progress: 10, message: 'Analyzing database schema...', log: '📊 Reading database tables and columns' },
                { progress: 30, message: 'Generating entities...', log: '🏗️  Creating TypeORM entities' },
                { progress: 50, message: 'Creating services...', log: '⚙️  Generating services and controllers' },
                { progress: 70, message: 'Setting up modules...', log: '📦 Creating NestJS modules' },
                { progress: 90, message: 'Finalizing project...', log: '🔧 Configuring package.json and dependencies' },
            ];

            for (const step of progressSteps) {
                updateStatus({
                    progress: step.progress,
                    message: step.message,
                    logs: [step.log]
                });
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const result = await apiService.generateProject({
                database: databaseConfig,
                project: projectConfig,
            });

            if (result.success && result.projectInfo) {
                updateStatus({
                    status: 'success',
                    progress: 100,
                    message: '✅ Project generated successfully!',
                    logs: [
                        '✅ Project generation completed!',
                        `📁 Project: ${result.projectInfo.name}`,
                        `💾 Size: ${result.projectInfo.size}`,
                        '🎉 Ready for download!'
                    ]
                });

                await loadGeneratedProjects();
                return result.projectInfo;
            } else {
                throw new Error(result.message || 'Generation failed');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            updateStatus({
                status: 'error',
                message: '❌ Generation failed',
                error: errorMessage,
                logs: [`❌ Generation error: ${errorMessage}`]
            });
            return null;
        }
    }, [databaseConfig, projectConfig, updateStatus]);

    const downloadProject = useCallback(async (sessionId: string) => { // ✅ Cambiar parámetro
        try {
            const blob = await apiService.downloadProject(sessionId);

            // Generar nombre de archivo apropiado
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `project-${sessionId.substring(0, 8)}-${timestamp}.zip`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            updateStatus({
                logs: [`📥 Downloaded: ${filename}`]
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            updateStatus({
                status: 'error',
                error: errorMessage,
                logs: [`❌ Download error: ${errorMessage}`]
            });
        }
    }, [updateStatus]);

    const loadGeneratedProjects = useCallback(async () => {
        try {
            const projects = await apiService.getGeneratedProjects();
            setGeneratedProjects(projects);
        } catch (error) {
            console.error('Failed to load generated projects:', error);
        }
    }, []);

    const resetStatus = useCallback(() => {
        setGenerationStatus({
            status: 'idle',
            progress: 0,
            message: 'Ready to generate',
            logs: [],
        });
    }, []);

    const updateDatabasePort = useCallback((type: DatabaseConfig['type']) => {
        setDatabaseConfig(prev => ({
            ...prev,
            type,
            port: type === 'postgresql' ? 5432 : 3306,
        }));
    }, []);

    return {
        databaseConfig,
        projectConfig,
        generationStatus,
        generatedProjects,
        setDatabaseConfig,
        setProjectConfig,
        updateDatabasePort,
        testConnection,
        generateProject,
        downloadProject,
        loadGeneratedProjects,
        resetStatus,
    };
}
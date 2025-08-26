import { useEffect } from 'react';
import { DatabaseSelector } from './components/DatabaseSelector';
import { DatabaseConfig } from './components/DatabaseConfig';
import { ProjectConfig } from './components/ProjectConfig';
import { GenerationProgress } from './components/GenerationProgress';
import { GeneratedProject } from './components/GeneratedProject';
import { useGenerator } from './hooks/useGenerator';

function App() {
    const {
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
    } = useGenerator();

    useEffect(() => {
        loadGeneratedProjects();
    }, [loadGeneratedProjects]);

    const handleGenerate = async () => {
        const connected = await testConnection();
        if (connected) {
            await generateProject();
        }
    };

    const canGenerate = generationStatus.status === 'idle' &&
        databaseConfig.host &&
        databaseConfig.database &&
        projectConfig.name;

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                🚀 NestJS Backend Generator
                            </h1>
                            <p className="mt-1 text-sm text-gray-500">
                                Generate complete NestJS backends from your database schema
                            </p>
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-500">v1.0.0</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-lg shadow p-6">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">
                                📊 Database Configuration
                            </h2>

                            <DatabaseSelector
                                selectedType={databaseConfig.type}
                                onTypeChange={updateDatabasePort}
                                disabled={generationStatus.status !== 'idle'}
                            />

                            <div className="mt-6">
                                <DatabaseConfig
                                    config={databaseConfig}
                                    onChange={setDatabaseConfig}
                                    onTestConnection={testConnection}
                                    disabled={generationStatus.status !== 'idle'}
                                    isLoading={generationStatus.status === 'connecting'}
                                />
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow p-6">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">
                                🏗️ Project Configuration
                            </h2>

                            <ProjectConfig
                                config={projectConfig}
                                onChange={setProjectConfig}
                                disabled={generationStatus.status !== 'idle'}
                            />
                        </div>

                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">
                                        Ready to Generate?
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        This will create a complete NestJS backend with all entities, services, and controllers
                                    </p>
                                </div>

                                <div className="flex space-x-3">
                                    {generationStatus.status !== 'idle' && (
                                        <button
                                            onClick={resetStatus}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                        >
                                            Reset
                                        </button>
                                    )}

                                    <button
                                        onClick={handleGenerate}
                                        disabled={!canGenerate || generationStatus.status === 'generating'}
                                        className={`px-6 py-3 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${canGenerate && generationStatus.status !== 'generating'
                                                ? 'text-white bg-blue-600 hover:bg-blue-700'
                                                : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                                            }`}
                                    >
                                        {generationStatus.status === 'generating' ? (
                                            <>
                                                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Generating...
                                            </>
                                        ) : (
                                            '🚀 Generate Backend'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <GenerationProgress status={generationStatus} />
                        <GeneratedProject
                            projects={generatedProjects}
                            onDownload={(sessionId) => downloadProject(sessionId)} // ✅ Cambiar aquí
                            onRefresh={loadGeneratedProjects}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
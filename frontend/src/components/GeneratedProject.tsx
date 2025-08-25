import React, { useState } from 'react';
import { Download, Trash2, RefreshCw, FolderOpen, Calendar, HardDrive } from 'lucide-react';
import { GeneratedProjectInfo } from '../types';
import toast from 'react-hot-toast';

interface GeneratedProjectProps {
    projects: GeneratedProjectInfo[];
    onDownload: (filename: string) => void;
    onRefresh: () => void;
}

export const GeneratedProject: React.FC<GeneratedProjectProps> = ({
    projects,
    onDownload,
    onRefresh
}) => {
    const [deletingProjects, setDeletingProjects] = useState<Set<string>>(new Set());

    const handleDownload = async (project: GeneratedProjectInfo) => {
        try {
            // ✅ Usar sessionId directamente
            await onDownload(project.sessionId);
            toast.success(`📥 Descargando ${project.name}...`);
        } catch (error) {
            toast.error('Error al descargar el proyecto');
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <FolderOpen className="w-5 h-5" />
                    Proyectos Generados
                </h3>
                <button
                    onClick={onRefresh}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title="Actualizar lista"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {projects.length === 0 ? (
                <div className="text-center py-8">
                    <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 mb-2">No hay proyectos generados</p>
                    <p className="text-sm text-gray-400">
                        Los proyectos aparecerán aquí después de generarlos
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {projects.map((project) => (
                        <div
                            key={project.name}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-gray-900 truncate">
                                        {project.name}
                                    </h4>
                                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <HardDrive className="w-3 h-3" />
                                            {project.size}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {formatDate(project.createdAt)}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={() => handleDownload(project)}
                                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                        title="Descargar proyecto"
                                    >
                                        <Download className="w-3 h-3" />
                                        Descargar
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {projects.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{projects.length} proyecto(s) disponible(s)</span>
                        <span>Los proyectos se eliminan automáticamente después de 24 horas</span>
                    </div>
                </div>
            )}
        </div>
    );
};
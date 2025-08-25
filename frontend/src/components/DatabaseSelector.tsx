import React from 'react';
import { Database, Server } from 'lucide-react';

interface DatabaseSelectorProps {
    selectedType: 'postgresql' | 'mysql';
    onTypeChange: (type: 'postgresql' | 'mysql') => void;
    disabled?: boolean; // ✅ AGREGAR prop faltante
}

export const DatabaseSelector: React.FC<DatabaseSelectorProps> = ({
    selectedType,
    onTypeChange,
    disabled = false // ✅ AGREGAR default value
}) => {
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Seleccionar Tipo de Base de Datos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PostgreSQL */}
                <div
                    className={`relative p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                        disabled ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                        selectedType === 'postgresql'
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                    onClick={() => !disabled && onTypeChange('postgresql')}
                >
                    <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${
                            selectedType === 'postgresql' ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                            <Server className={`w-6 h-6 ${
                                selectedType === 'postgresql' ? 'text-blue-600' : 'text-gray-600'
                            }`} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800">PostgreSQL</h4>
                            <p className="text-sm text-gray-600">
                                Soporte completo para tipos avanzados (JSONB, UUID, arrays)
                            </p>
                        </div>
                    </div>

                    {selectedType === 'postgresql' && (
                        <div className="absolute top-2 right-2">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        </div>
                    )}
                </div>

                {/* MySQL */}
                <div
                    className={`relative p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                        disabled ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                        selectedType === 'mysql'
                            ? 'border-orange-500 bg-orange-50 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                    onClick={() => !disabled && onTypeChange('mysql')}
                >
                    <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${
                            selectedType === 'mysql' ? 'bg-orange-100' : 'bg-gray-100'
                        }`}>
                            <Database className={`w-6 h-6 ${
                                selectedType === 'mysql' ? 'text-orange-600' : 'text-gray-600'
                            }`} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800">MySQL / MariaDB</h4>
                            <p className="text-sm text-gray-600">
                                Compatible con MySQL y MariaDB, charset UTF8MB4
                            </p>
                        </div>
                    </div>

                    {selectedType === 'mysql' && (
                        <div className="absolute top-2 right-2">
                            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
                <h5 className="font-medium text-gray-800 mb-2">Configuración por Defecto:</h5>
                <div className="text-sm text-gray-600 space-y-1">
                    {selectedType === 'postgresql' ? (
                        <>
                            <p>• <span className="font-medium">Puerto:</span> 5432</p>
                            <p>• <span className="font-medium">Usuario:</span> postgres</p>
                            <p>• <span className="font-medium">Características:</span> JSONB, UUID, Triggers, Funciones</p>
                        </>
                    ) : (
                        <>
                            <p>• <span className="font-medium">Puerto:</span> 3306</p>
                            <p>• <span className="font-medium">Usuario:</span> root</p>
                            <p>• <span className="font-medium">Características:</span> JSON, UTF8MB4, InnoDB</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
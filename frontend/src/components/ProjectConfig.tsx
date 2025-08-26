import React from 'react';
import { FileText } from 'lucide-react';
import { ProjectConfig as ProjConfig } from '../types';

interface ProjectConfigProps {
  config: ProjConfig;
  onChange: (config: ProjConfig) => void;
  disabled: boolean;
}

export const ProjectConfig: React.FC<ProjectConfigProps> = ({
  config,
  onChange,
  disabled
}) => {
  const handleInputChange = (field: keyof ProjConfig, value: string) => {
    onChange({
      ...config,
      [field]: value
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Nombre del Proyecto */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del Proyecto *
          </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            disabled={disabled}
            className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="mi-backend-nestjs"
            pattern="^[a-zA-Z0-9-_]+$"
          />
          <p className="text-xs text-gray-500 mt-1">
            Solo letras, números, guiones y guiones bajos. Se usará como nombre de directorio.
          </p>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            value={config.description || ''}
            onChange={(e) => handleInputChange('description', e.target.value)}
            disabled={disabled}
            rows={3}
            className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            placeholder="Backend NestJS generado automáticamente desde base de datos"
          />
        </div>
      </div>

      {/* Características del Proyecto */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h5 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          🚀 Características Incluidas:
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
          {[
            'Arquitectura modular NestJS',
            'TypeORM configurado',
            'CRUD completo por tabla',
            'Validación con class-validator',
            'Documentación Swagger',
            'Variables de entorno',
            'Tests unitarios básicos',
            'Configuración ESLint/Prettier',
            'Detección automática de relaciones',
            'Soporte JSON/JSONB',
            'Middleware de logging',
            'Filtros de excepciones'
          ].map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Validación del nombre */}
      {config.name && !/^[a-zA-Z0-9-_]+$/.test(config.name) && (
        <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
          <p className="text-sm text-orange-700">
            ⚠️ El nombre del proyecto solo puede contener letras, números, guiones y guiones bajos.
          </p>
        </div>
      )}

      {config.name && (config.name.length < 3 || config.name.length > 50) && (
        <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
          <p className="text-sm text-orange-700">
            ⚠️ El nombre del proyecto debe tener entre 3 y 50 caracteres.
          </p>
        </div>
      )}
    </div>
  );
};
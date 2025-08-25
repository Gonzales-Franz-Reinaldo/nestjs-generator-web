import React from 'react';
import { Loader, CheckCircle, XCircle, AlertCircle, Terminal } from 'lucide-react';
import { GenerationStatus } from '../types';

interface GenerationProgressProps {
  status: GenerationStatus;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({ status }) => {
  if (status.status === 'idle') {
    return null;
  }

  const getStatusColor = () => {
    switch (status.status) {
      case 'connecting':
        return 'blue';
      case 'generating':
        return 'blue';
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case 'connecting':
        return <Loader className="w-5 h-5 animate-spin text-blue-600" />;
      case 'generating':
        return <Loader className="w-5 h-5 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const color = getStatusColor();

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {status.status === 'connecting' && 'Probando Conexión...'}
            {status.status === 'generating' && 'Generando Proyecto...'}
            {status.status === 'success' && '✅ ¡Proyecto Generado Exitosamente!'}
            {status.status === 'error' && '❌ Error en la Generación'}
          </h3>
          <p className="text-sm text-gray-600">{status.message}</p>
        </div>
      </div>

      {/* Progress Bar */}
      {(status.status === 'connecting' || status.status === 'generating') && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Progreso</span>
            <span>{Math.round(status.progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`bg-${color}-600 h-2 rounded-full transition-all duration-300 ease-out`}
              style={{ width: `${status.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Logs */}
      {status.logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Terminal className="w-4 h-4" />
            Logs del Proceso:
          </div>
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-60 overflow-y-auto scrollbar-hide">
            {status.logs.map((log, index) => (
              <div key={index} className="mb-1 flex items-start gap-2">
                <span className="text-gray-500 text-xs mt-0.5">{index + 1}.</span>
                <span>{log}</span>
              </div>
            ))}
            {status.status === 'generating' && (
              <div className="flex items-center gap-2 mt-2">
                <Loader className="w-3 h-3 animate-spin" />
                <span className="text-yellow-400">Procesando...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Details */}
      {status.status === 'error' && status.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h5 className="font-medium text-red-800 mb-2">Detalles del Error:</h5>
          <pre className="text-sm text-red-700 whitespace-pre-wrap overflow-x-auto">
            {status.error}
          </pre>
        </div>
      )}

      {/* Success Details */}
      {status.status === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h5 className="font-medium text-green-800 mb-2">🎉 ¡Generación Completada!</h5>
          <div className="text-sm text-green-700 space-y-1">
            <p>• El proyecto NestJS ha sido generado exitosamente</p>
            <p>• Todos los módulos, entidades y controladores están listos</p>
            <p>• La documentación Swagger está incluida</p>
            <p>• El proyecto está listo para descargar</p>
          </div>
        </div>
      )}
    </div>
  );
};
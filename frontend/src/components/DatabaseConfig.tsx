import React, { useState } from 'react';
import { TestTube, CheckCircle, XCircle, Loader } from 'lucide-react';
import { DatabaseConfig as DBConfig } from '../types';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

interface DatabaseConfigProps {
  config: DBConfig;
  onChange: (config: DBConfig) => void;
  onTestConnection: () => void;
  disabled: boolean;
  isLoading: boolean;
}

export const DatabaseConfig: React.FC<DatabaseConfigProps> = ({
  config,
  onChange,
  onTestConnection,
  disabled,
  isLoading
}) => {
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    tables?: string[];
  } | null>(null);

  const handleInputChange = (field: keyof DBConfig, value: string | number) => {
    onChange({
      ...config,
      [field]: field === 'port' ? Number(value) : value
    });
    // Reset test result when config changes
    setTestResult(null);
  };

  const testConnection = async () => {
    try {
      const result = await apiService.testConnection(config);
      setTestResult(result);

      if (result.success) {
        toast.success(`✅ Conexión exitosa! ${result.tables?.length || 0} tablas encontradas`);
        onTestConnection();
      } else {
        toast.error(`❌ Error de conexión: ${result.message}`);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Error desconocido';
      setTestResult({
        success: false,
        message: errorMessage
      });
      toast.error(`❌ Error: ${errorMessage}`);
    }
  };

  const defaultPorts = {
    postgresql: 5432,
    mysql: 3306
  };

  const defaultUsers = {
    postgresql: 'postgres',
    mysql: 'root'
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Host */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Host / Servidor
          </label>
          <input
            type="text"
            value={config.host}
            onChange={(e) => handleInputChange('host', e.target.value)}
            disabled={disabled}
            className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="localhost"
          />
        </div>

        {/* Puerto */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Puerto
          </label>
          <input
            type="number"
            value={config.port}
            onChange={(e) => handleInputChange('port', e.target.value)}
            disabled={disabled}
            className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder={defaultPorts[config.type].toString()}
          />
        </div>

        {/* Usuario */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Usuario
          </label>
          <input
            type="text"
            value={config.username}
            onChange={(e) => handleInputChange('username', e.target.value)}
            disabled={disabled}
            className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder={defaultUsers[config.type]}
          />
        </div>

        {/* Contraseña */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={config.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            disabled={disabled}
            className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="••••••••"
          />
        </div>

        {/* Base de Datos */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre de la Base de Datos
          </label>
          <input
            type="text"
            value={config.database}
            onChange={(e) => handleInputChange('database', e.target.value)}
            disabled={disabled}
            className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="db_automation"
          />
        </div>
      </div>

      {/* Test Connection */}
      <div className="flex flex-col space-y-3">
        <button
          onClick={testConnection}
          disabled={isLoading || disabled || !config.host || !config.database}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Probando Conexión...
            </>
          ) : (
            <>
              <TestTube className="w-4 h-4" />
              Probar Conexión
            </>
          )}
        </button>

        {/* Test Result */}
        {testResult && (
          <div className={`p-4 rounded-lg flex items-center gap-3 animate-fadeInUp ${
            testResult.success
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${
                testResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {testResult.success ? '✅ ¡Conexión Exitosa!' : '❌ Error de Conexión'}
              </p>
              <p className={`text-sm ${
                testResult.success ? 'text-green-700' : 'text-red-700'
              }`}>
                {testResult.message}
              </p>
              {testResult.success && testResult.tables && (
                <div className="mt-2">
                  <p className="text-sm text-green-700 font-medium">
                    📊 {testResult.tables.length} tablas encontradas:
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {testResult.tables.slice(0, 8).map((table, index) => (
                      <span
                        key={index}
                        className="inline-block px-2 py-1 text-xs bg-green-100 text-green-700 rounded"
                      >
                        {table}
                      </span>
                    ))}
                    {testResult.tables.length > 8 && (
                      <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                        +{testResult.tables.length - 8} más...
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h5 className="font-medium text-blue-800 mb-2">💡 Consejos:</h5>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Asegúrate de que la base de datos esté ejecutándose</li>
          <li>• Verifica que el usuario tenga permisos de lectura</li>
          <li>• Las tablas deben existir antes de generar el proyecto</li>
          <li>• Se detectarán automáticamente las relaciones (Foreign Keys)</li>
        </ul>
      </div>
    </div>
  );
};
import type {
    DatabaseConfig,
    GenerationConfig,
    TestConnectionResponse,
    GenerateProjectResponse,
    GeneratedProjectInfo
} from '../types';

const API_BASE_URL = 'http://localhost:3004/api';

class ApiService {
    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${API_BASE_URL}${endpoint}`;
        
        console.log(`🔗 API Request: ${options.method || 'GET'} ${url}`);

        const config: RequestInit = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        };

        try {
            const response = await fetch(url, config);
            
            console.log(`📡 Response status: ${response.status}`); 

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: `HTTP ${response.status}: ${response.statusText}` 
                }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`✅ Response data:`, data);
            return data;
        } catch (error) {
            console.error(`❌ API Error: ${endpoint}`, error);
            
            // Manejo específico de errores de red
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                throw new Error('No se puede conectar al servidor. Verifica que el backend esté ejecutándose en puerto 3001.');
            }
            
            throw error;
        }
    }

    async testConnection(config: DatabaseConfig): Promise<TestConnectionResponse> {
        return this.request<TestConnectionResponse>('/database/test', {
            method: 'POST',
            body: JSON.stringify(config),
        });
    }

    async generateProject(config: GenerationConfig): Promise<GenerateProjectResponse> {
        return this.request<GenerateProjectResponse>('/generator/generate', {
            method: 'POST',
            body: JSON.stringify(config),
        });
    }

    async downloadProject(sessionId: string): Promise<Blob> {
        const response = await fetch(`${API_BASE_URL}/generator/download/${sessionId}`);

        if (!response.ok) {
            throw new Error('Failed to download project');
        }

        return response.blob();
    }

    async getGeneratedProjects(): Promise<GeneratedProjectInfo[]> {
        return this.request<GeneratedProjectInfo[]>('/generator/projects');
    }

    async deleteProject(sessionId: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/generator/projects/${sessionId}`, {
            method: 'DELETE',
        });
    }
}

export const apiService = new ApiService();
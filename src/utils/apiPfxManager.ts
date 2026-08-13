import axios from 'axios'

import env from './env'
import { logger } from './logger'

const API_BASE_URL = env.API_PFX_MANAGER || 'http://localhost:5000'

export class ApiPfxManager {
    private apiClient

    constructor() {
        this.apiClient = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
            },
        })
    }

    async checkApiHealth() {
        try {
            const response = await this.apiClient.get(`/certificates`)
            if (response.status === 200) {
                logger.info(`API está acessível.`)
            } else {
                logger.warn(`API respondeu, mas com status diferente de 200.`)
            }
        } catch (error) {
            if (error instanceof Error) {
                logger.error(`Não foi possível acessar a API: ${error.message}`)
            } else {
                logger.error(`Erro desconhecido ao acessar a API.`)
            }
            process.exit(1)
        }
    }

    async organizeCertificates(): Promise<void> {
        try {
            const response = await this.apiClient.post('/certificates/organize')
            logger.info(response.data.message || 'Certificados organizados com sucesso.')
        } catch (error) {
            logger.error(`Erro ao organizar certificados: ${error}`)
        }
    }

    async clearCertificates(): Promise<void> {
        try {
            const response = await this.apiClient.post('/certificates/clear')
            logger.info(response.data.message || 'Certificados removidos com sucesso.')
        } catch (error) {
            logger.error(`Erro ao limpar certificados: ${error}`)
        }
    }

    async installCertificate(cnpj: string): Promise<boolean> {
        try {
            const response = await this.apiClient.post('/certificates/install', { cnpj })
            if (response.status === 200) {
                logger.info(response.data.message || 'Certificado instalado com sucesso.')
                return true
            }
            return false
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                logger.error(`Certificado não encontrado para o CNPJ ${cnpj}.`)
            } else {
                logger.error(`Erro ao instalar certificado: ${error}`)
            }
            return false
        }
    }

    async listCertificates(page = 1, limit = 10): Promise<void> {
        try {
            const response = await this.apiClient.get('/certificates', {
                params: { page, limit },
            })
            logger.info(response.data.message || 'Lista de certificados obtida com sucesso.')
        } catch (error) {
            logger.error(`Erro ao listar certificados: ${error}`)
        }
    }
}

import mongoose from 'mongoose'
import { logger } from '@utils/logger'

export async function connectDB(): Promise<void> {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/aeron'
        await mongoose.connect(uri)
        logger.info('----------------------------------------')
        logger.info('Conectado ao MongoDB com sucesso.')
    } catch (error) {
        logger.info('----------------------------------------')
        logger.error(`Erro ao conectar ao MongoDB: ${(error as Error).message}`)
        process.exit(1)
    }
}

import dotenv from 'dotenv'
import { resolve, join } from 'path'

export function validateEnv(requiredKeys: string[]): void {
    const missingKeys = requiredKeys.filter(key => !process.env[key])

    if (missingKeys.length > 0) {
        console.error(`Variáveis de ambiente ausentes ou inválidas: ${missingKeys.join(', ')}`)
        process.exit(1)
    }
}

dotenv.config({ path: resolve(join(__dirname, '../..', '.env')) })

export default process.env

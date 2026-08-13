import Note from '@models/Note'
import { logger } from '../utils/logger'

export class AuditService {
    async removeNotesFromInactiveCompanies() {
        try {
            const notes = await Note.find().populate('company')
    
            for (const note of notes) {
                if (note.company?.status !== "A") {
                    await note.deleteOne()
                    logger.info(`Nota ${note._id} removida (empresa inativa).`)
                }
            }
        } catch (error) {
            logger.error('----------------------------------------')
            logger.error("Erro ao tentar excluir as notas inativas")
            console.error(error)
        }
    }
}
